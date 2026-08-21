// Loads the plugin's QML-flavoured .js libs into node so the same source that
// runs inside omarchy-shell can be unit tested. QML libraries declare
// `.pragma library` and pull siblings in with `.import "x.js" as X`; both are
// directives the plain JS parser rejects, so we resolve them ourselves and
// evaluate the remainder in a vm context whose globals become the exports.
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const LIB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib")
const cache = new Map()

export function load(name) {
  const file = name.endsWith(".js") ? name : name + ".js"
  if (cache.has(file)) return cache.get(file)

  const source = fs.readFileSync(path.join(LIB_DIR, file), "utf8")
  const context = vm.createContext({ console, Date, Math, JSON })
  cache.set(file, context) // set early so a cycle resolves to the partial namespace

  const body = source.replace(/^\s*\.pragma\s+library\s*$/gm, "")
    .replace(/^\s*\.import\s+"([^"]+)"\s+as\s+([A-Za-z_$][\w$]*)\s*$/gm, (_, dep, alias) => {
      context[alias] = load(dep)
      return ""
    })

  vm.runInContext(body, context, { filename: file })
  return context
}
