import { useState } from "react";
import styles from "./ProfileAvatar.module.css";

export const ProfileAvatar = ({
  name,
  avatarUrl,
  size = 42,
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && avatarUrl !== failedUrl);
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImage ? (
        <img src={avatarUrl ?? undefined} alt="" onError={() => setFailedUrl(avatarUrl ?? null)} />
      ) : name.trim().slice(0, 1).toUpperCase() || "K"}
    </span>
  );
};
