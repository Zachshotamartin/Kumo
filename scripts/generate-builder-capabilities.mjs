import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The catalog is generated from the SAME typed functions used by Kumo's UI.
// --check is a parity gate: adding/changing a user action requires refreshing it.
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const definitions = {};
const seen = new Map();
const excluded = new Set(['ensureUserProfile', 'createOnboardingBoard', 'rewriteShapeAssetIds', 'collectShapeAssetIds', 'loadBoardPreview', 'uploadBoardImage']);
const readonly = /^(get|list|load|search|resolveAssetUrl|compare|diff|coverageReportUrl)/;
const confirmation = /^(invite|transfer|leave|removeBoardCollaborator|updateBoardCollaboratorRole|removeWorkspaceMember|updateWorkspaceMember|publish|govern|createShareLink|createPrototypeLink|createOpenSession|requestAccountDeletion|revoke|deleteBoard$|mutateFriendship|testPush|subscribePush|resolveAccessRequest|mergeDesignBranch|restoreBoardVersion)/;

function schema(type) {
  const flags = type.flags;
  if (flags & ts.TypeFlags.StringLiteral) return { const: type.value };
  if (flags & ts.TypeFlags.NumberLiteral) return { const: type.value };
  if (flags & ts.TypeFlags.BooleanLiteral) return { const: type.intrinsicName === 'true' };
  if (flags & ts.TypeFlags.Null) return { type: 'null' };
  if (flags & ts.TypeFlags.String) return { type: 'string', maxLength: 16000 };
  if (flags & ts.TypeFlags.Number) return { type: 'number', minimum: -1000000, maximum: 1000000 };
  if (flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
  if (type.isUnion()) {
    const members = type.types.filter(member => !(member.flags & ts.TypeFlags.Undefined));
    return members.length === 1 ? schema(members[0]) : { anyOf: members.map(schema) };
  }
  if (checker.isArrayType(type)) return { type: 'array', maxItems: 500, items: schema(checker.getTypeArguments(type)[0]) };
  if (type.symbol?.name === 'File') return { type: 'string', pattern: '^file:', description: 'Handle returned by ui.pickFile; the user chooses the file.' };
  if (seen.has(type)) return { $ref: `#/definitions/${seen.get(type)}` };
  const name = `t${seen.size}`;
  seen.set(type, name);
  definitions[name] = {};
  const properties = {};
  const required = [];
  for (const property of checker.getPropertiesOfType(type)) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (!declaration) continue;
    properties[property.name] = schema(checker.getTypeOfSymbolAtLocation(property, declaration));
    if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
  }
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  definitions[name] = { type: 'object', properties, required, additionalProperties: index ? schema(index) : false };
  return { $ref: `#/definitions/${name}` };
}

const capabilities = [];
function add(domain, name, type, declaration) {
  const signature = type.getCallSignatures()[0];
  if (!signature) return;
  const parameters = signature.parameters.map(parameter => {
    const node = parameter.valueDeclaration ?? declaration;
    return { name: parameter.name, schema: schema(checker.getTypeOfSymbolAtLocation(parameter, node)), optional: Boolean(node.questionToken || node.initializer) };
  });
  if (domain === 'editor') parameters.unshift({ name: 'selectionIds', schema: { type: 'array', items: { type: 'string', maxLength: 16000 }, maxItems: 500 }, optional: false });
  capabilities.push({ id: `${domain}.${name}`, domain, name, parameters,
    readOnly: readonly.test(name) || name === 'copySelected',
    confirmation: confirmation.test(name),
    description: ts.displayPartsToString(signature.getDocumentationComment(checker)) || `${name}(${parameters.map(p => p.name + (p.optional ? '?' : '')).join(', ')})`,
  });
}
for (const filename of readdirSync('src/services').filter(name => name.endsWith('Repository.ts')).sort()) {
  const source = program.getSourceFile(resolve('src/services', filename));
  const domain = filename.replace('Repository.ts', '');
  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
    if (excluded.has(symbol.name)) continue;
    const declaration = symbol.valueDeclaration;
    if (declaration) add(domain, symbol.name, checker.getTypeOfSymbolAtLocation(symbol, declaration), declaration);
  }
}
const editorSource = program.getSourceFile(resolve('src/editor/useEditorActionsCore.ts'));
const editorAlias = editorSource.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'EditorActions');
for (const property of checker.getPropertiesOfType(checker.getTypeAtLocation(editorAlias))) {
  if (['previewShapes', 'cancelPreview', 'commitShapes', 'commitBoardPatch'].includes(property.name)) continue;
  add('editor', property.name, checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration), property.valueDeclaration);
}
const shapeSource = program.getSourceFile(resolve('src/classes/shape.ts'));
const shape = schema(checker.getTypeAtLocation(shapeSource.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'Shape')));
const output = JSON.stringify({ capabilities, shape, definitions }, null, 2) + '\n';
const path = 'src/builder/generatedCapabilities.json';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('Builder capability catalog is stale. Run node scripts/generate-builder-capabilities.mjs.');
} else writeFileSync(path, output);
console.log(`${capabilities.length} typed Kumo actions in builder catalog.`);
