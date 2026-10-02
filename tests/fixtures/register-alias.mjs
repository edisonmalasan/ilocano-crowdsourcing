/**
 * Installs the `@/*` path-alias resolver into a plain-Node process.
 *
 * Passed to `node --import <this file>`, so the hook is registered before the `-e` script's own
 * dynamic `import()` runs. See `alias-resolver.mjs` for the mapping and for why it is a real file
 * rather than a `data:` URL.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// `fileURLToPath` then `pathToFileURL`, not `url.pathname.slice(1)`. The slice is a Windows
// shortcut that silently mangles a path containing `%20` or any other percent-escape — and this
// repository's own path contains a space-free but non-trivial path today, which is exactly the kind
// of condition that makes a shortcut look correct until the day it does not.
const HOOK = pathToFileURL(fileURLToPath(new URL("./alias-resolver.mjs", import.meta.url)));

register(HOOK);
