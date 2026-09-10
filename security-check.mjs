import fs from 'node:fs'
import path from 'node:path'

const root = new URL('./dist/', import.meta.url)
const forbidden = [
  {name: 'new Function()', re: /\bnew\s+Function\s*\(/},
  {name: 'direct eval()', re: /(^|[^\w$.])eval\s*\(/m},
]
let failed = false

function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(?:js|mjs|cjs|html)$/i.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8')
      for (const rule of forbidden) {
        if (rule.re.test(text)) {
          console.error(`SECURITY CHECK FAILED: ${rule.name} found in ${full}`)
          failed = true
        }
      }
    }
  }
}

walk(root.pathname)
if (failed) process.exit(1)
console.log('Security check passed: no new Function() or direct eval() found in dist.')
