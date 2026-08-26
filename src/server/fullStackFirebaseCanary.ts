export interface VerifiedCanaryAccount {
  email: string;
  password: string;
  uid: string;
  sessionId: string;
  idToken: string;
  refreshToken: string;
  expirationTime: number;
}

export interface FirebaseCanaryAdmin {
  createUser(input: {
    email: string;
    password: string;
    emailVerified: true;
    displayName: string;
  }): Promise<{ uid: string }>;
  deleteUser(uid: string): Promise<void>;
}

export interface FirebasePasswordSignIn {
  idToken?: unknown;
  refreshToken?: unknown;
  localId?: unknown;
  expiresIn?: unknown;
}

export interface FirebaseCanaryServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const requiredServiceAccountField = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Firebase canary service account is missing ${key}.`);
  }
  return value;
};

export const parseFirebaseCanaryServiceAccount = (source: string): FirebaseCanaryServiceAccount => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new Error("Firebase canary service account is not valid JSON.", { cause });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Firebase canary service account must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  return {
    projectId: requiredServiceAccountField(record, "project_id"),
    clientEmail: requiredServiceAccountField(record, "client_email"),
    privateKey: requiredServiceAccountField(record, "private_key").replace(/\\n/g, "\n"),
  };
};

export const createVerifiedCanaryAccount = async (
  label: string,
  admin: FirebaseCanaryAdmin,
  signIn: (email: string, password: string) => Promise<FirebasePasswordSignIn>,
  randomId: () => string,
  now: () => number = Date.now
): Promise<VerifiedCanaryAccount> => {
  const password = `Kumo-${randomId()}-A1!`;
  const email = `kumo-full-stack-${label}-${randomId()}@example.com`;
  const created = await admin.createUser({
    email,
    password,
    emailVerified: true,
    displayName: `Kumo ${label} canary`,
  });
  try {
    const account = await signIn(email, password);
    const expiresIn = Number(account.expiresIn);
    if (
      typeof account.idToken !== "string"
      || typeof account.refreshToken !== "string"
      || account.localId !== created.uid
      || !Number.isFinite(expiresIn)
      || expiresIn <= 0
    ) {
      throw new Error(`Firebase returned an incomplete ${label} canary identity.`);
    }
    return {
      email,
      password,
      uid: created.uid,
      sessionId: randomId(),
      idToken: account.idToken,
      refreshToken: account.refreshToken,
      expirationTime: now() + expiresIn * 1_000,
    };
  } catch (error) {
    try {
      await admin.deleteUser(created.uid);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Firebase ${label} canary setup and rollback failed.`);
    }
    throw error;
  }
};
