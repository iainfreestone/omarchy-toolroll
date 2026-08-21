// Every tool, checked against an answer this plugin did not produce.
//
// The main suite proves the libraries behave as written. This proves they
// behave as *expected* — each tool is run and its output compared with what
// python, openssl or coreutils says the answer is. Marking a tool "passes"
// because it returned without throwing is a much weaker claim than it looks.
//
// Skipped wholesale where python3 is unavailable, so the main suite still runs
// anywhere. Run it directly:  node tests/crosscheck.mjs
process.env.TZ = "UTC"

import { execFileSync } from "node:child_process"
import { load } from "./qmljs.mjs"
import { describe, ok, eq, report } from "./harness.mjs"

const Catalog = load("catalog")
const Samples = load("samples")

function py(code) {
  return execFileSync("python3", ["-c", code], { encoding: "utf8" }).replace(/\n$/, "")
}
function sh(command) {
  return execFileSync("sh", ["-c", command], { encoding: "utf8" }).replace(/\n$/, "")
}
function run(id, input, state) {
  const tool = Catalog.byId(id)
  if (!tool) throw new Error("no such tool: " + id)
  return Catalog.run(tool, input, Object.assign(Catalog.defaultsFor(tool), state || {}))
}
function field(result, label) {
  const found = result.fields.filter(f => f.label === label)[0]
  return found ? found.value : "(no such field: " + label + ")"
}

const SAMPLE = "The quick brown fox — café 🌍"

describe("base64 ↔ coreutils")
eq("encode", run("base64", SAMPLE, { mode: "encode" }).output,
   sh(`printf '%s' ${JSON.stringify(SAMPLE)} | base64 -w0`))
eq("decode", run("base64", sh(`printf '%s' ${JSON.stringify(SAMPLE)} | base64 -w0`),
   { mode: "decode" }).output, SAMPLE)
eq("url-safe alphabet", run("base64", "ûÿ", { mode: "encode", urlSafe: true }).output,
   py(`import base64;print(base64.urlsafe_b64encode('ûÿ'.encode()).decode())`))

describe("url encoding ↔ python urllib")
eq("component", run("url-encode", "a b&c=d/e?f#g", { mode: "encode" }).output,
   py(`import urllib.parse;print(urllib.parse.quote('a b&c=d/e?f#g', safe=''))`))
eq("decode", run("url-encode", "caf%C3%A9%20%F0%9F%8C%8D", { mode: "decode" }).output,
   py(`import urllib.parse;print(urllib.parse.unquote('caf%C3%A9%20%F0%9F%8C%8D'))`))

describe("html entities ↔ python html")
eq("decode named and numeric", run("html-entities", "&lt;b&gt;caf&eacute;&#233;&#x1F30D;&lt;/b&gt;",
   { mode: "decode" }).output,
   py(`import html;print(html.unescape('&lt;b&gt;caf&eacute;&#233;&#x1F30D;&lt;/b&gt;'))`))
eq("minimal encode matches html.escape, once the apostrophe spelling is normalised",
   run("html-entities", `<a href="x">it's</a>`, { mode: "encode", scope: "minimal" })
     .output.replace("&#39;", "&#x27;"),
   py(`import html;print(html.escape('<a href="x">it\\'s</a>'))`))

describe("hashes ↔ openssl")
for (const [label, algorithm] of [["MD5", "md5"], ["SHA-1", "sha1"], ["SHA-256", "sha256"],
                                  ["SHA-384", "sha384"], ["SHA-512", "sha512"]]) {
  eq(label, field(run("hash", SAMPLE), label),
     sh(`printf '%s' ${JSON.stringify(SAMPLE)} | openssl dgst -${algorithm} -r | cut -d' ' -f1`))
}
eq("HMAC-SHA-256", field(run("hash", SAMPLE, { hmacKey: "s3cret" }), "HMAC-SHA-256"),
   sh(`printf '%s' ${JSON.stringify(SAMPLE)} | openssl dgst -sha256 -mac HMAC -macopt key:s3cret -r | cut -d' ' -f1`))
eq("CRC32", field(run("hash", "123456789"), "CRC32"),
   py(`import zlib;print(format(zlib.crc32(b'123456789'), '08x'))`))

describe("number bases ↔ python int()")
const BIG = "340282366920938463463374607431768211455"
eq("decimal of a 128-bit hex", field(run("base-convert", "f".repeat(32), { from: "16", group: false }), "Decimal"),
   py(`print(int('f'*32, 16))`))
eq("back to hex", field(run("base-convert", BIG, { from: "10", group: false }), "Hexadecimal"),
   "0x" + py(`print(format(int('${BIG}'), 'X'))`))
eq("binary", field(run("base-convert", "205", { from: "10", group: false }), "Binary"),
   py(`print(format(205, 'b'))`))

describe("json ↔ python json")
const DOC = '{"b":1,"a":[1,2,{"c":null}],"s":"caf\\u00e9"}'
eq("minified", run("json", DOC, { mode: "minify" }).output,
   py(`import json;print(json.dumps(json.loads(r'''${DOC}'''), separators=(',',':'), ensure_ascii=False))`))
eq("indented", run("json", DOC, { mode: "format", indent: "2" }).output,
   py(`import json;print(json.dumps(json.loads(r'''${DOC}'''), indent=2, ensure_ascii=False))`))
eq("sorted keys", run("json", DOC, { mode: "minify", sortKeys: true }).output,
   py(`import json;print(json.dumps(json.loads(r'''${DOC}'''), separators=(',',':'), sort_keys=True, ensure_ascii=False))`))

describe("yaml ↔ PyYAML")
const YAML = "name: toolroll\nversion: 2.1\nenabled: true\ntags: [a, b]\nnested:\n  k: v\nlist:\n  - one\n  - two"
eq("yaml to json", run("json-yaml", YAML, { mode: "toJson", indent: "2" }).output,
   py(`import yaml,json;print(json.dumps(yaml.safe_load(r'''${YAML}'''), indent=2, ensure_ascii=False))`))
// Round trip through the real parser: what we emit must mean the same thing.
eq("json to yaml means the same",
   py(`import yaml,json;print(json.dumps(yaml.safe_load(r'''${run("json-yaml", '{"a":1,"b":["x","y"],"c":{"d":true}}', { mode: "toYaml" }).output}'''), sort_keys=True))`),
   py(`import json;print(json.dumps(json.loads('{"a":1,"b":["x","y"],"c":{"d":true}}'), sort_keys=True))`))

describe("csv ↔ python csv")
const CSV = 'name,note\nada,"say ""hi"", twice"\ngrace,plain'
eq("csv to json", run("json-csv", CSV, { mode: "toJson", coerceTypes: false, indent: "2" }).output,
   py(`import csv,io,json;print(json.dumps(list(csv.DictReader(io.StringIO(r'''${CSV}'''))), indent=2))`))

describe("unix time ↔ python datetime")
eq("iso", field(run("unixtime", "1700000000"), "ISO 8601"),
   py(`import datetime;print(datetime.datetime.fromtimestamp(1700000000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'))`))
eq("epoch from an iso string", field(run("unixtime", "2023-11-14T22:13:20Z"), "Epoch seconds"),
   py(`import datetime;print(int(datetime.datetime.fromisoformat('2023-11-14T22:13:20+00:00').timestamp()))`))
eq("day of the week", field(run("unixtime", "1700000000"), "Day").split(",")[0],
   py(`import datetime;print(datetime.datetime.fromtimestamp(1700000000, datetime.timezone.utc).strftime('%A'))`))

describe("url parsing ↔ python urllib")
const URL = "https://user:pw@api.example.co.uk:8443/v1/items/42?q=hello%20world&t=a#frag"
eq("scheme", field(run("url-parse", URL), "Scheme"), py(`import urllib.parse;print(urllib.parse.urlsplit('${URL}').scheme)`))
eq("host", field(run("url-parse", URL), "Host"), py(`import urllib.parse;print(urllib.parse.urlsplit('${URL}').netloc.split('@')[1])`))
eq("path", field(run("url-parse", URL), "Path"), py(`import urllib.parse;print(urllib.parse.urlsplit('${URL}').path)`))
eq("fragment", field(run("url-parse", URL), "Fragment"), py(`import urllib.parse;print(urllib.parse.urlsplit('${URL}').fragment)`))

describe("colour ↔ python colorsys")
const HSL = py(`import colorsys
h,l,s = colorsys.rgb_to_hls(30/255, 144/255, 255/255)
print('%g %g %g' % (round(h*360,1), round(s*100,1), round(l*100,1)))`)
// Compared as numbers: python prints 100.0 where JavaScript prints 100.
eq("hsl", field(run("color", "#1e90ff"), "HSL").match(/[0-9.]+/g).join(" "), HSL)
eq("rgb", field(run("color", "#1e90ff"), "RGB"), "rgb(30, 144, 255)")
eq("hex from a css name", field(run("color", "rebeccapurple"), "HEX"), "#663399")

describe("diff ↔ python difflib")
const LEFT = "alpha\nbeta\ngamma\ndelta"
const RIGHT = "alpha\nBETA\ngamma\ndelta\nepsilon"
const counted = run("diff", LEFT, { right: RIGHT })
const pyCounts = py(`import difflib
a = '''${LEFT}'''.split('\\n'); b = '''${RIGHT}'''.split('\\n')
d = list(difflib.ndiff(a, b))
print('%d %d' % (len([x for x in d if x.startswith('+ ')]), len([x for x in d if x.startswith('- ')])))`)
eq("added and removed counts", counted.rows.filter(r => r.type === "add").length + " " +
   counted.rows.filter(r => r.type === "remove").length, pyCounts)

describe("regex ↔ python re")
const SUBJECT = "ada@example.com, grace@navy.mil and nobody"
const PATTERN = "(\\w+)@([\\w.]+)"
eq("match count", field(run("regex", SUBJECT, { pattern: PATTERN }), "Matches"),
   py(`import re;print(len(re.findall(r'${PATTERN}', '${SUBJECT}')))`))
eq("the matches themselves", run("regex", SUBJECT, { pattern: PATTERN }).output,
   py(`import re;print('\\n'.join(m.group(0) for m in re.finditer(r'${PATTERN}', '${SUBJECT}')))`))

describe("text statistics ↔ python")
const PROSE = "One two three.\n\nFour five! Six seven eight?"
eq("words", field(run("text-stats", PROSE), "Words"), py(`print(len('''${PROSE}'''.split()))`))
eq("characters", field(run("text-stats", PROSE), "Characters"), py(`print(len('''${PROSE}'''))`))
eq("utf-8 size of multi-byte text", field(run("text-stats", "café 🌍"), "Size as UTF-8").split(" ")[0],
   py(`print(len('café 🌍'.encode('utf-8')))`))

describe("line tools ↔ python")
const LINES = "banana\napple\nCherry\napple\ndate"
eq("sort, case-insensitive", run("lines", LINES, { mode: "sort" }).output,
   py(`print('\\n'.join(sorted('''${LINES}'''.split('\\n'), key=str.lower)))`))
eq("dedupe keeps first occurrence", run("lines", LINES, { mode: "dedupe" }).output,
   py(`
seen=set(); out=[]
for l in '''${LINES}'''.split('\\n'):
    k=l.lower()
    if k not in seen: seen.add(k); out.append(l)
print('\\n'.join(out))`))

describe("id inspector ↔ python uuid")
const UUID = "550e8400-e29b-41d4-a716-446655440000"
eq("version", field(run("id-inspect", UUID), "Version"), py(`import uuid;print(uuid.UUID('${UUID}').version)`))
eq("variant is RFC 4122", field(run("id-inspect", UUID), "Variant"),
   py(`import uuid;print('RFC 4122' if uuid.UUID('${UUID}').variant == uuid.RFC_4122 else 'other')`))

describe("uuid generation is well formed")
const generated = run("uuid", "", { kind: "v4", count: "5" }).output.split("\n")
eq("count", generated.length, 5)
eq("python parses every one", py(`import uuid
ids = '''${generated.join(",")}'''.split(',')
print(all(str(uuid.UUID(i)) == i and uuid.UUID(i).version == 4 for i in ids))`), "True")

describe("qr code round trips through qrencode and zbarimg")
const PAYLOAD = "https://omarchy.org/toolroll?x=1&y=2"
const qr = run("qr", PAYLOAD)
const tmp = "/tmp/omarchy-toolroll-crosscheck.png"
const argv = qr.imageCommand.map(a => a === "%OUT%" ? tmp : a)
execFileSync(argv[0], argv.slice(1))
eq("what qrencode wrote decodes back to the payload",
   sh(`zbarimg --quiet --raw -- ${tmp}`), PAYLOAD)
// And the reader builds the command that reads it back.
eq("the reader's command is well formed",
   run("qr-read", "/tmp/omarchy-toolroll-scan-1.png").textCommand.join(" "),
   "zbarimg --quiet --raw -- /tmp/omarchy-toolroll-scan-1.png")
sh(`rm -f ${tmp}`)

describe("formatters are lossless")
// A formatter must not change what the document says — minifying its own
// output has to land back where it started.
const XML = '<?xml version="1.0"?><catalog><book id="1"><title>Dune</title></book></catalog>'
eq("xml", run("xml", run("xml", XML, { mode: "format" }).output, { mode: "minify" }).output,
   run("xml", XML, { mode: "minify" }).output)
const HTML = '<div class="a"><p>Some <b>bold</b> text.</p><ul><li>one</li></ul></div>'
eq("html", run("html", run("html", HTML, { mode: "format" }).output, { mode: "minify" }).output,
   run("html", HTML, { mode: "minify" }).output)
const CSS = "@media (min-width:600px){.a,.b{color:red;margin:0}}"
eq("css", run("css", run("css", CSS, { mode: "format" }).output, { mode: "minify" }).output,
   run("css", CSS, { mode: "minify" }).output)
const SQL = "select a, b from t where x = 1 and y = 2 order by a desc"
eq("sql", run("sql", run("sql", SQL, { mode: "format", uppercase: false }).output,
   { mode: "minify" }).output, run("sql", SQL, { mode: "minify" }).output)
// Raising keywords is deliberate; reaching inside a string or a quoted
// identifier would not be, because those are not case-insensitive.
const CASED = run("sql", `select 'MixedCase' as "QuotedId" from MyTable`,
   { mode: "format", uppercase: true }).output
ok("string literals keep their case", CASED.indexOf("'MixedCase'") !== -1, CASED)
ok("quoted identifiers keep theirs", CASED.indexOf('"QuotedId"') !== -1, CASED)
ok("table names keep theirs", CASED.indexOf("MyTable") !== -1, CASED)
ok("but keywords are raised", CASED.indexOf("SELECT") === 0, CASED)
// And parsing what a formatter produced must give the same data back.
eq("json survives its own formatting",
   py(`import json;print(json.dumps(json.loads(r'''${run("json", DOC, { mode: "format" }).output}'''), sort_keys=True))`),
   py(`import json;print(json.dumps(json.loads(r'''${DOC}'''), sort_keys=True))`))

describe("the remaining tools return what they say")
eq("case converter", field(run("case", "hello world again"), "camelCase"), "helloWorldAgain")
eq("escape", run("escape", 'a\nb\t"c"', { mode: "escape" }).output, 'a\\nb\\t\\"c\\"')
eq("unescape round trips", run("escape", run("escape", 'a\nb\t"c"', { mode: "escape" }).output,
   { mode: "unescape" }).output, 'a\nb\t"c"')
eq("jwt subject", field(run("jwt", Samples.forTool("jwt")[0].input), "Subject"), "1234567890")
eq("cron meaning", field(run("cron", "0 3 * * *"), "Meaning"), "At 03:00, every day")
// slice(-4) truncated this to U+F30D, and the escape with it — an escape that
// silently produces a different character when pasted into code.
const astral = run("unicode", "🌍").output
ok("astral code points are not truncated", astral.indexOf("U+1F30D") !== -1, astral)
ok("nor are their escapes", astral.indexOf("u{1F30D}") !== -1, astral)
ok("short ones are still padded to four", run("unicode", "A").output.indexOf("U+0041") !== -1)
eq("json to types", run("json-types", '{"id":1}', { language: "typescript" }).output,
   "export interface Root {\n  id: number;\n}")
eq("lorem word count", run("lorem", "", { unit: "words", count: "10" }).output.split(" ").length, 10)
eq("random string length", run("random-string", "", { length: "32", count: "1" }).output.length, 32)
eq("markdown preview passes clean text through", run("markdown", "# Title").output, "# Title")
eq("html preview passes clean markup through", run("html-preview", "<b>hi</b>").output, "<b>hi</b>")
eq("base64 image builds a data uri prefix",
   run("base64-image", "/tmp/omarchy-toolroll-scan-1.png", { mode: "encode", mime: "image/png" }).textPrefix,
   "data:image/png;base64,")
eq("history computes nothing", run("history", "").output, "")

report()
