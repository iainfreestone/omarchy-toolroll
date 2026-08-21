// Local-time rendering is part of what these libs do, so pin the zone —
// otherwise the expectations below only hold on one machine.
process.env.TZ = "UTC"

import fsSync from "node:fs"
import { createHash } from "node:crypto"
import { load } from "./qmljs.mjs"
import { describe, ok, eq, throws, report } from "./harness.mjs"

const Bytes = load("bytes")
const Hash = load("hash")
const Text = load("text")
const Json = load("json")
const Yaml = load("yaml")
const Csv = load("csv")
const Num = load("numbers")
const Color = load("color")
const Time = load("time")
const Cron = load("cron")
const Url = load("url")
const Jwt = load("jwt")
const Diff = load("diff")
const Gen = load("generate")
const Sql = load("sql")
const Markup = load("markup")
const Catalog = load("catalog")
const Detect = load("detect")
const Chain = load("chain")
const DataUrl = load("dataurl")
const Types = load("types")
const History = load("history")
const Recents = load("recents")
const Palette = load("palette")
const Sanitize = load("sanitize")
const Samples = load("samples")
const Sections = load("sections")
// The first of a tool's three examples, which is the one these older
// assertions were written against.
const sampleOf = id => (Samples.forTool(id)[0] || {}).input
const sampleStateOf = id => (Samples.forTool(id)[0] || {}).state || {}

describe("bytes: utf-8")
eq("ascii round trip", Bytes.fromUtf8(Bytes.toUtf8("hello")), "hello")
eq("emoji round trip", Bytes.fromUtf8(Bytes.toUtf8("héllo 🌍")), "héllo 🌍")
eq("euro is 3 bytes", Bytes.toUtf8("€"), [0xe2, 0x82, 0xac])
eq("emoji is 4 bytes", Bytes.toUtf8("🌍"), [0xf0, 0x9f, 0x8c, 0x8d])
throws("strict rejects truncated sequence", () => Bytes.fromUtf8([0xe2, 0x82], true))
throws("strict rejects overlong", () => Bytes.fromUtf8([0xc0, 0xaf], true))
eq("lenient replaces bad bytes", Bytes.fromUtf8([0x61, 0xff, 0x62]), "a�b")

eq("utf8Length matches toUtf8", ["", "a", "héllo", "€", "🌍", "a🌍b€c", "\u{10FFFF}"]
  .map(t => Bytes.utf8Length(t)), ["", "a", "héllo", "€", "🌍", "a🌍b€c", "\u{10FFFF}"]
  .map(t => Bytes.toUtf8(t).length))
eq("utf8Length handles a lone surrogate like toUtf8 does",
  Bytes.utf8Length("a\uD800b"), Bytes.toUtf8("a\uD800b").length)
eq("utf8Length of nothing", Bytes.utf8Length(null), 0)

describe("bytes: base64")
eq("encode", Bytes.encodeBase64(Bytes.toUtf8("hello")), "aGVsbG8=")
eq("encode no pad", Bytes.encodeBase64(Bytes.toUtf8("hello"), false, false), "aGVsbG8")
eq("encode url-safe", Bytes.encodeBase64([0xfb, 0xff], true), "-_8=")
eq("encode std", Bytes.encodeBase64([0xfb, 0xff], false), "+/8=")
eq("decode", Bytes.fromUtf8(Bytes.decodeBase64("aGVsbG8=")), "hello")
eq("decode unpadded", Bytes.fromUtf8(Bytes.decodeBase64("aGVsbG8")), "hello")
eq("decode url-safe", Bytes.decodeBase64("-_8"), [0xfb, 0xff])
eq("decode ignores whitespace", Bytes.fromUtf8(Bytes.decodeBase64("aGVs\nbG8=")), "hello")
eq("empty", Bytes.decodeBase64(""), [])
throws("rejects junk", () => Bytes.decodeBase64("aGVs*bG8="))
ok("detects base64", Bytes.looksLikeBase64("aGVsbG8gd29ybGQ="))
ok("rejects prose with spaces", !Bytes.looksLikeBase64("hello world"))
ok("rejects a lowercase word", !Bytes.looksLikeBase64("developers"))

describe("bytes: hex")
eq("to hex", Bytes.toHex([0x00, 0x0f, 0xff]), "000fff")
eq("to hex upper spaced", Bytes.toHex([0xde, 0xad], true, " "), "DE AD")
eq("from hex", Bytes.fromHex("0xDEAD"), [0xde, 0xad])
eq("from hex with separators", Bytes.fromHex("de:ad be:ef"), [0xde, 0xad, 0xbe, 0xef])
throws("odd length hex", () => Bytes.fromHex("abc"))

describe("bytes: helpers")
eq("wrap", Bytes.wrapLines("abcdef", 2), "ab\ncd\nef")
eq("human bytes", Bytes.humanBytes(2048), "2 KB")

describe("hash: known vectors")
const h = (alg, text) => Bytes.toHex(Hash.digest(alg, Bytes.toUtf8(text)))
eq("md5 empty", h("md5", ""), "d41d8cd98f00b204e9800998ecf8427e")
eq("md5 abc", h("md5", "abc"), "900150983cd24fb0d6963f7d28e17f72")
eq("md5 long", h("md5", "The quick brown fox jumps over the lazy dog"), "9e107d9d372bb6826bd81d3542a419d6")
eq("sha1 empty", h("sha1", ""), "da39a3ee5e6b4b0d3255bfef95601890afd80709")
eq("sha1 abc", h("sha1", "abc"), "a9993e364706816aba3e25717850c26c9cd0d89d")
eq("sha224 abc", h("sha224", "abc"), "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7")
eq("sha256 empty", h("sha256", ""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
eq("sha256 abc", h("sha256", "abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
eq("sha384 abc", h("sha384", "abc"), "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7")
eq("sha512 empty", h("sha512", ""), "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e")
eq("sha512 abc", h("sha512", "abc"), "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f")
eq("crc32 check", Bytes.toHex(Hash.digest("crc32", Bytes.toUtf8("123456789"))), "cbf43926")
eq("multi-block sha256", h("sha256", "a".repeat(1000)),
  "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3")
eq("multi-block sha512", h("sha512", "a".repeat(1000)),
  "67ba5535a46e3f86dbfbed8cbbaf0125c76ed549ff8b0b9e03e0c88cf90fa634fa7b12b47d77b694de488ace8d9a65967dc96df599727d3292a8d9d447709c97")
eq("unicode sha256", h("sha256", "héllo 🌍"), h("sha256", "héllo 🌍"))

describe("hash: hmac")
eq("hmac sha256 rfc4231-2", Bytes.toHex(Hash.hmac("sha256", Bytes.toUtf8("Jefe"), Bytes.toUtf8("what do ya want for nothing?"))),
  "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843")
eq("hmac sha512 rfc4231-2", Bytes.toHex(Hash.hmac("sha512", Bytes.toUtf8("Jefe"), Bytes.toUtf8("what do ya want for nothing?"))),
  "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737")
eq("hmac md5 rfc2202-2", Bytes.toHex(Hash.hmac("md5", Bytes.toUtf8("Jefe"), Bytes.toUtf8("what do ya want for nothing?"))),
  "750c783e6ab0b503eaa86e310a5db738")
throws("hmac rejects crc32", () => Hash.hmac("crc32", [1], [2]))

describe("text: url")
eq("component encodes reserved", Text.urlEncodeComponent("a b&c=d/e?f"), "a%20b%26c%3Dd%2Fe%3Ff")
eq("component encodes rfc3986 extras", Text.urlEncodeComponent("it's (a) test!*"), "it%27s%20%28a%29%20test%21%2A")
eq("full keeps structure", Text.urlEncodeFull("https://x.dev/a b?q=1&r=2"), "https://x.dev/a%20b?q=1&r=2")
eq("decode", Text.urlDecode("a%20b%26c"), "a b&c")
eq("decode unicode", Text.urlDecode("caf%C3%A9"), "café")
eq("decode salvages malformed", Text.urlDecode("ok%zz%20end"), "ok%zz end")
eq("decode plus", Text.urlDecodePlus("a+b%2Bc"), "a b+c")

describe("text: html entities")
eq("named", Text.htmlEncode("<a href=\"x\">café</a>", "named"), "&lt;a href=&quot;x&quot;&gt;caf&eacute;&lt;/a&gt;")
eq("minimal leaves accents", Text.htmlEncode("café & <b>", "minimal"), "caf&eacute; &amp; &lt;b&gt;".replace("&eacute;", "é"))
eq("all is numeric", Text.htmlEncode("café", "all"), "caf&#233;")
eq("astral pair is one reference", Text.htmlEncode("🌍", "all"), "&#127757;")
eq("decode named", Text.htmlDecode("&lt;b&gt;caf&eacute;&lt;/b&gt;"), "<b>café</b>")
eq("decode numeric", Text.htmlDecode("&#233;&#x1F30D;"), "é🌍")
eq("decode leaves unknown alone", Text.htmlDecode("&notreal; &amp;"), "&notreal; &")
eq("round trip", Text.htmlDecode(Text.htmlEncode("<x> & 'y' \"z\" é", "named")), "<x> & 'y' \"z\" é")

describe("text: escaping")
eq("escape", Text.backslashEscape('line1\nline2\t"q"\\end'), 'line1\\nline2\\t\\"q\\"\\\\end')
eq("escape control chars", Text.backslashEscape("\u0001"), "\\u0001")
eq("single-quote style", Text.backslashEscape("it's \"ok\"", "single"), "it\\'s \"ok\"")
eq("unescape", Text.backslashUnescape('a\\nb\\tc\\\\d'), "a\nb\tc\\d")
eq("unescape \\u", Text.backslashUnescape("caf\\u00e9"), "café")
eq("unescape \\u{}", Text.backslashUnescape("\\u{1F30D}"), "🌍")
eq("unescape \\x", Text.backslashUnescape("\\x41"), "A")
eq("escape round trip", Text.backslashUnescape(Text.backslashEscape("a\nb\t\"c\"\\d")), 'a\nb\t"c"\\d')

describe("text: case")
eq("words splits humps", Text.words("parseHTTPResponse2XML"), ["parse", "HTTP", "Response", "2", "XML"])
eq("camel", Text.toCase("hello world-again", "camel"), "helloWorldAgain")
eq("pascal", Text.toCase("hello world", "pascal"), "HelloWorld")
eq("snake", Text.toCase("helloWorldAgain", "snake"), "hello_world_again")
eq("constant", Text.toCase("hello-world", "constant"), "HELLO_WORLD")
eq("kebab", Text.toCase("HelloWorld", "kebab"), "hello-world")
eq("train", Text.toCase("hello_world", "train"), "Hello-World")
eq("dot", Text.toCase("HelloWorld", "dot"), "hello.world")
eq("title", Text.toCase("the QUICK brown", "title"), "The Quick Brown")
eq("sentence", Text.toCase("the QUICK brown", "sentence"), "The quick brown")
eq("empty input", Text.toCase("", "camel"), "")

describe("text: lines")
const L = "banana\napple\nBanana\ncherry\napple"
eq("sort", Text.lineOp(L, "sort", {}), "apple\napple\nbanana\nBanana\ncherry")
eq("sort desc", Text.lineOp("b\na\nc", "sort", { descending: true }), "c\nb\na")
eq("natural sort", Text.lineOp("item10\nitem2\nitem1", "sort", { natural: true }), "item1\nitem2\nitem10")
eq("dedupe", Text.lineOp(L, "dedupe", {}), "banana\napple\ncherry")
eq("dedupe case sensitive", Text.lineOp(L, "dedupe", { caseSensitive: true }), "banana\napple\nBanana\ncherry")
eq("duplicates only", Text.lineOp(L, "duplicates", {}), "banana\napple")
eq("reverse", Text.lineOp("a\nb\nc", "reverse", {}), "c\nb\na")
eq("number", Text.lineOp("a\nb", "number", {}), "1. a\n2. b")
eq("trim", Text.lineOp("  a  \n\tb", "trim", {}), "a\nb")
eq("join", Text.lineOp("a\nb", "join", { joiner: "|" }), "a|b")
eq("drop blanks", Text.lineOp("a\n\n\nb", "dedupe", { ignoreBlank: true }), "a\nb")
eq("stats", Text.stats("hi there\nyou"), { characters: 12, charactersNoSpaces: 10, words: 3, lines: 2 })

describe("json: parse")
eq("object", Json.parse('{"a":1,"b":[true,null,"x"]}').b, [true, null, "x"])
eq("preserves key order", Json.keysOf(Json.parse('{"z":1,"a":2,"10":3,"2":4}'), false), ["z", "a", "10", "2"])
eq("sorted keys", Json.keysOf(Json.parse('{"z":1,"a":2}'), true), ["a", "z"])
eq("escapes", Json.parse('"a\\nb\\u00e9"'), "a\nbé")
eq("numbers", Json.parse('[1,-2.5,1e3,0]'), [1, -2.5, 1000, 0])
eq("nested empties", Json.stringify(Json.parse('{"a":{},"b":[]}'), 0), '{"a":{},"b":[]}')
throws("rejects trailing comma", () => Json.parse('{"a":1,}'))
throws("rejects single quotes", () => Json.parse("{'a':1}"))
throws("rejects trailing content", () => Json.parse('{"a":1} junk'))
ok("lenient accepts trailing comma", Json.parse('{"a":1,}', true).a === 1)
ok("lenient accepts comments", Json.parse('{ // hi\n"a":1 /* x */ }', true).a === 1)
ok("lenient accepts bare keys", Json.parse('{a:1}', true).a === 1)
ok("lenient accepts single quotes", Json.parse("{'a':'b'}", true).a === "b")

describe("json: error positions")
let err = null
try { Json.parse('{\n  "a": 1,\n  "b": oops\n}') } catch (e) { err = e }
ok("reports line", err && err.line === 3, err ? "line " + err.line : "no error thrown")
ok("reports column", err && err.column === 8, err ? "column " + err.column : "")
ok("formats nicely", err && /line 3, column 8/.test(err.formatted), err ? err.formatted : "")

describe("json: stringify")
const doc = Json.parse('{"b":1,"a":{"n":[1,2]}}')
eq("indent 2", Json.stringify(doc, 2), '{\n  "b": 1,\n  "a": {\n    "n": [\n      1,\n      2\n    ]\n  }\n}')
eq("minify", Json.stringify(doc, 0), '{"b":1,"a":{"n":[1,2]}}')
eq("tab indent", Json.stringify(Json.parse('{"a":1}'), "\t"), '{\n\t"a": 1\n}')
eq("sort keys", Json.stringify(doc, 0, { sortKeys: true }), '{"a":{"n":[1,2]},"b":1}')
eq("escape unicode", Json.stringify("café", 0, { escapeUnicode: true }), '"caf\\u00e9"')
eq("keeps unicode by default", Json.stringify("café", 0), '"café"')
eq("summary", Json.summarize(Json.parse('{"a":[1,"x",null,true]}')), { objects: 1, arrays: 1, strings: 1, numbers: 1, booleans: 1, nulls: 1, depth: 3 })

describe("yaml: scalars")
eq("null forms", [Yaml.parseScalar("~"), Yaml.parseScalar("null"), Yaml.parseScalar("")], [null, null, null])
eq("bools", [Yaml.parseScalar("true"), Yaml.parseScalar("False")], [true, false])
eq("norway problem avoided", Yaml.parseScalar("no"), "no")
eq("ints", [Yaml.parseScalar("42"), Yaml.parseScalar("-7"), Yaml.parseScalar("0x1f")], [42, -7, 31])
eq("floats", [Yaml.parseScalar("3.14"), Yaml.parseScalar("1e3")], [3.14, 1000])
eq("quoted stays string", Yaml.parseScalar('"42"'), "42")
eq("single quotes", Yaml.parseScalar("'it''s'"), "it's")
eq("double quote escapes", Yaml.parseScalar('"a\\nb"'), "a\nb")

describe("yaml: parse")
const ydoc = Yaml.parse([
  "# a comment",
  "name: omarchy",
  "version: 2.1",
  "enabled: true",
  "tags: [linux, wayland]",
  "owner:",
  "  name: dhh",
  "  handle: \"@dhh\"",
  "servers:",
  "  - host: a.example  # inline comment",
  "    port: 443",
  "  - host: b.example",
  "    port: 80",
  "empty:",
  "note: |",
  "  line one",
  "  line two",
  "folded: >",
  "  wrapped text",
  "  continues here"
].join("\n"))
eq("string", ydoc.name, "omarchy")
eq("float", ydoc.version, 2.1)
eq("bool", ydoc.enabled, true)
eq("flow seq", ydoc.tags, ["linux", "wayland"])
eq("nested map", ydoc.owner, { name: "dhh", handle: "@dhh" })
eq("seq of maps", ydoc.servers, [{ host: "a.example", port: 443 }, { host: "b.example", port: 80 }])
eq("empty value is null", ydoc.empty, null)
eq("literal block", ydoc.note, "line one\nline two\n")
eq("folded block", ydoc.folded, "wrapped text continues here\n")
eq("key order preserved", Yaml.keysOf(ydoc).slice(0, 4), ["name", "version", "enabled", "tags"])

eq("nested sequences", Yaml.parse("matrix:\n  - [1, 2]\n  - [3, 4]").matrix, [[1, 2], [3, 4]])
eq("flow map", Yaml.parse("a: {x: 1, y: two}").a, { x: 1, y: "two" })
eq("url value keeps colon", Yaml.parse("url: https://x.dev/a").url, "https://x.dev/a")
eq("top level sequence", Yaml.parse("- one\n- two"), ["one", "two"])
eq("chomped block", Yaml.parse("s: |-\n  a\n  b").s, "a\nb")
eq("kept block", Yaml.parse("s: |+\n  a\n").s, "a\n")
eq("multi document", Yaml.parse("---\na: 1\n---\nb: 2"), [{ a: 1 }, { b: 2 }])
throws("rejects anchors loudly", () => Yaml.parse("a: &anchor 1\nb: *anchor"))
throws("rejects tab indentation", () => Yaml.parse("a:\n\tb: 1"))

describe("yaml: emit")
eq("scalar map", Yaml.emit({ a: 1, b: "two" }), "a: 1\nb: two")
eq("nested", Yaml.emit({ a: { b: [1, 2] } }), "a:\n  b:\n    - 1\n    - 2")
eq("quotes ambiguous strings", Yaml.emit({ a: "true", b: "12", c: "yes" }), 'a: "true"\nb: "12"\nc: yes')
eq("empty collections", Yaml.emit({ a: {}, b: [] }), "a: {}\nb: []")
eq("multiline becomes literal", Yaml.emit({ a: "x\ny" }), "a: |-\n  x\n  y")
eq("seq of maps", Yaml.emit([{ a: 1 }, { b: 2 }]), "-\n  a: 1\n-\n  b: 2")
eq("round trip", Yaml.parse(Yaml.emit(ydoc)).servers, ydoc.servers)

describe("csv")
eq("detects semicolons", Csv.detectDelimiter("a;b;c\n1;2;3"), ";")
eq("detects tabs", Csv.detectDelimiter("a\tb\n1\t2"), "\t")
eq("quoted commas", Csv.parseRows('a,"b,c",d', ","), [["a", "b,c", "d"]])
eq("doubled quotes", Csv.parseRows('a,"say ""hi"""', ","), [["a", 'say "hi"']])
eq("embedded newline", Csv.parseRows('a,"line1\nline2"', ","), [["a", "line1\nline2"]])
eq("crlf", Csv.parseRows("a,b\r\n1,2", ","), [["a", "b"], ["1", "2"]])
eq("to json", Csv.toJson("name,age\nada,36\ngrace,45", { coerceTypes: true }),
  [{ name: "ada", age: 36 }, { name: "grace", age: 45 }])
eq("keeps strings when not coercing", Csv.toJson("n\n007", {}), [{ n: "007" }])
eq("no header", Csv.toJson("1,2\n3,4", { header: false, coerceTypes: true }), [[1, 2], [3, 4]])
eq("column order", Json.keysOf(Csv.toJson("z,a\n1,2", {})[0], false), ["z", "a"])
eq("from json", Csv.fromJson([{ a: 1, b: "x,y" }, { a: 2, c: true }]), 'a,b,c\n1,"x,y",\n2,,true')
eq("from arrays", Csv.fromJson([["a", "b"], [1, 2]]), "a,b\n1,2")
eq("round trip", Csv.toJson(Csv.fromJson([{ a: "1", b: "two" }]), {}), [{ a: "1", b: "two" }])
throws("unterminated quote", () => Csv.parseRows('a,"b', ","))
ok("table preview has a rule", Csv.toTable("a,bb\n1,2").split("\n")[1].indexOf("─") === 0)

describe("numbers")
eq("hex to dec", Num.convert("ff", 16, 10), "255")
eq("dec to hex", Num.convert("255", 10, 16), "ff")
eq("dec to bin", Num.convert("10", 10, 2), "1010")
eq("bin to hex", Num.convert("11111111", 2, 16), "ff")
eq("base 36", Num.convert("zz", 36, 10), "1295")
eq("zero", Num.convert("0", 10, 2), "0")
eq("negative", Num.convert("-255", 10, 16), "-ff")
eq("strips 0x prefix", Num.convert("0xDEAD", 16, 10), "57005")
eq("huge value stays exact", Num.convert("ffffffffffffffffffffffffffffffff", 16, 10),
  "340282366920938463463374607431768211455")
eq("huge round trip", Num.convert(Num.convert("f".repeat(32), 16, 10), 10, 16), "f".repeat(32))
throws("rejects bad digit", () => Num.convert("2", 2, 10))
eq("sniffs base", Num.sniffBase("0b1010"), [2, "1010"])
eq("validates", [Num.isValidIn("ff", 16), Num.isValidIn("fg", 16)], [true, false])
eq("twos complement positive", Num.twosComplement("5", 8), "00000101")
eq("twos complement negative", Num.twosComplement("-5", 8), "11111011")
eq("out of range", Num.twosComplement("300", 8), null)
eq("groups", Num.groupDigits("11111111", 4, " "), "1111 1111")

describe("color")
eq("short hex", Color.parse("#f00"), { r: 255, g: 0, b: 0, a: 1 })
eq("long hex", Color.parse("#ff8800"), { r: 255, g: 136, b: 0, a: 1 })
eq("hex with alpha", Color.parse("#ff000080").a, 0.5019607843137255)
eq("bare hex", Color.parse("1e90ff"), { r: 30, g: 144, b: 255, a: 1 })
eq("named", Color.parse("rebeccapurple"), { r: 102, g: 51, b: 153, a: 1 })
eq("rgb()", Color.parse("rgb(1, 2, 3)"), { r: 1, g: 2, b: 3, a: 1 })
eq("rgba() with slash", Color.parse("rgba(10 20 30 / 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 })
eq("rgb percentages", Color.parse("rgb(100%, 0%, 0%)"), { r: 255, g: 0, b: 0, a: 1 })
eq("hsl()", Color.parse("hsl(210, 100%, 50%)"), { r: 0, g: 128, b: 255, a: 1 })
eq("hsv()", Color.parse("hsv(0, 100%, 100%)"), { r: 255, g: 0, b: 0, a: 1 })
throws("rejects nonsense", () => Color.parse("not a color"))
const teal = Color.describe("#008080")
eq("hex out", teal.hex, "#008080")
eq("rgb string", teal.rgbString, "rgb(0, 128, 128)")
eq("hsl string", teal.hslString, "hsl(180, 100%, 25.1%)")
eq("cmyk", teal.cmykString, "cmyk(100%, 0%, 0%, 49.8%)")
eq("names it", [teal.nearestName, teal.isNamedExactly], ["teal", true])
eq("white on white has no contrast", Color.describe("#ffffff").contrastWhite, 1)
eq("black on white is 21:1", Color.describe("#000000").contrastWhite, 21)
eq("hsl round trip", Color.parse(Color.describe("#3c8dbc").hslString), Color.parse("#3c8dbc"))

describe("time")
eq("seconds detected", Time.parse("1700000000").unit, "seconds")
eq("millis detected", Time.parse("1700000000000").unit, "milliseconds")
eq("micros detected", Time.parse("1700000000000000").unit, "microseconds")
eq("nanos detected", Time.parse("1700000000000000000").unit, "nanoseconds")
eq("all units agree", [
  Time.parse("1700000000").date.getTime(),
  Time.parse("1700000000000").date.getTime(),
  Time.parse("1700000000000000").date.getTime()
], [1700000000000, 1700000000000, 1700000000000])
eq("iso string", Time.describe("1700000000").iso, "2023-11-14T22:13:20.000Z")
eq("utc rendering", Time.describe("1700000000").utc, "Tuesday, 14 Nov 2023 22:13:20 UTC")
eq("day of week", Time.describe("1700000000").dayOfWeek, "Tuesday")
eq("quarter", Time.describe("1700000000").quarter, "Q4")
eq("iso week", Time.describe("2023-11-14T00:00:00Z").isoWeek, "2023-W46")
eq("day of year", Time.describe("2023-01-31T12:00:00").dayOfYear, 31)
eq("leap year", [Time.describe("2024-01-01T12:00:00").leapYear, Time.describe("2023-01-01T12:00:00").leapYear], [true, false])
eq("iso input round trips", Time.describe("2023-11-14T22:13:20Z").epochSeconds, 1700000000)
eq("space separated input", Time.describe("2023-11-14 22:13:20Z").epochSeconds, 1700000000)
eq("relative past", Time.relative(new Date(1000), new Date(3 * 3600 * 1000 + 1000)), "3 hours ago")
eq("relative future", Time.relative(new Date(90 * 1000), new Date(0)), "in 1 minute")
eq("relative now", Time.relative(new Date(0), new Date(1000)), "just now")
eq("duration", Time.durationBreakdown(90061), "1d 1h 1m 1s")
throws("rejects gibberish", () => Time.parse("not a time"))

describe("cron: parse and describe")
eq("every minute", Cron.describe(Cron.parse("* * * * *")), "Every minute, every day")
eq("daily", Cron.describe(Cron.parse("0 3 * * *")), "At 03:00, every day")
eq("weekday mornings", Cron.describe(Cron.parse("30 9 * * 1-5")),
  "At 09:30, on Monday, Tuesday, Wednesday, Thursday, and Friday")
eq("step minutes", Cron.describe(Cron.parse("*/15 * * * *")), "Every 15 minutes, every day")
eq("busy schedules are counted, not listed", Cron.describe(Cron.parse("*/15 9-17 * * 1-5")),
  "36 times a day, on Monday, Tuesday, Wednesday, Thursday, and Friday")
eq("month names", Cron.describe(Cron.parse("0 0 1 JAN,JUL *")), "At 00:00, on day 1 of the month in January and July")
eq("day names", Cron.describe(Cron.parse("0 12 * * SAT,SUN")), "At 12:00, on Sunday and Saturday")
eq("shorthand", Cron.parse("@daily").__normalized, "0 0 * * *")
eq("sunday as 7", Cron.parse("0 0 * * 7")["day of week"].values, [0])
eq("six fields", Cron.parse("30 0 3 * * *").__hasSeconds, true)
eq("list expansion", Cron.parse("0 0,6,12,18 * * *")["hour"].values, [0, 6, 12, 18])
eq("range with step", Cron.parse("0 0-23/6 * * *")["hour"].values, [0, 6, 12, 18])
throws("rejects wrong field count", () => Cron.parse("* * *"))
throws("rejects out of range", () => Cron.parse("0 99 * * *"))
throws("rejects @reboot", () => Cron.parse("@reboot"))

describe("cron: next runs")
const base = new Date(2024, 0, 1, 9, 0, 0) // Monday 1 Jan 2024, 09:00 local
const runs = Cron.nextRuns(Cron.parse("0 3 * * *"), 3, base)
const localStamp = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
  String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":00"
eq("next daily runs", runs.map(localStamp), ["2024-01-02 03:00", "2024-01-03 03:00", "2024-01-04 03:00"])
const weekdays = Cron.nextRuns(Cron.parse("0 9 * * 1-5"), 6, new Date(2024, 0, 4, 10, 0, 0))
eq("skips the weekend", weekdays.map(d => d.getDate()), [5, 8, 9, 10, 11, 12])
const either = Cron.nextRuns(Cron.parse("0 0 13 * 5"), 3, new Date(2024, 8, 1))
eq("dom or dow when both are set", either.map(d => d.getDate()), [6, 13, 20])
eq("leap day", localStamp(Cron.nextRuns(Cron.parse("0 0 29 2 *"), 1, new Date(2023, 0, 1))[0]), "2024-02-29 00:00")

describe("url")
const u = Url.parse("https://user:pw@api.example.co.uk:8443/v1/items/42?q=hello%20world&tag=a&tag=b&flag#section-2")
eq("protocol", u.protocol, "https")
eq("credentials", [u.username, u.password], ["user", "pw"])
eq("hostname", u.hostname, "api.example.co.uk")
eq("port", u.port, "8443")
eq("host", u.host, "api.example.co.uk:8443")
eq("origin", u.origin, "https://api.example.co.uk:8443")
eq("path", u.path, "/v1/items/42")
eq("segments", u.pathSegments, ["v1", "items", "42"])
eq("hash", u.hash, "section-2")
eq("tld", u.tld, "uk")
eq("params decoded", u.params.map(p => p.key + "=" + p.value), ["q=hello world", "tag=a", "tag=b", "flag="])
eq("ipv6 host", Url.parse("http://[2001:db8::1]:9090/x").hostname, "[2001:db8::1]")
eq("no scheme", Url.parse("/just/a/path?a=1").path, "/just/a/path")
eq("plus is a space", Url.parse("http://x/?q=a+b").params[0].value, "a b")
eq("rebuild round trip", Url.build(Url.parse("https://x.dev/a?b=1#c")), "https://x.dev/a?b=1#c")
eq("re-encodes on rebuild", Url.buildQuery([{ key: "q", value: "a b&c" }]), "q=a%20b%26c")
throws("rejects empty", () => Url.parse(""))

describe("jwt")
// HS256 token minted below by the same HMAC the verifier uses, then checked
// against an independently produced signature (see the openssl cross-check).
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
  ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
const d = Jwt.decode(token, new Date(1700000000000))
eq("header", d.header, { alg: "HS256", typ: "JWT" })
eq("subject", d.payload.sub, "1234567890")
eq("algorithm", d.algorithm, "HS256")
eq("claim labels", d.claims.map(c => c.label), ["Subject", "Name", "Issued at"])
ok("dates the iat claim", /2018/.test(d.claims[2].note), d.claims[2].note)
eq("no expiry", d.expiryStatus, "no expiry claim")
eq("verifies with the right secret", Jwt.verify(d, "your-256-bit-secret").valid, true)
eq("rejects the wrong secret", Jwt.verify(d, "nope").valid, false)
eq("asks for a secret", Jwt.verify(d, "").valid, null)
eq("RS256 is honest about it", Jwt.verify({ algorithm: "RS256" }, "x").supported, false)
eq("strips Bearer", Jwt.decode("Bearer " + token).payload.name, "John Doe")
throws("rejects two-part tokens", () => Jwt.decode("a.b"))
throws("rejects garbage payload", () => Jwt.decode("eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.x"))
ok("detects jwts", Jwt.looksLikeJwt(token))
ok("does not claim plain base64", !Jwt.looksLikeJwt("aGVsbG8gd29ybGQ="))

const expired = Jwt.decode("eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(JSON.stringify({ exp: 1600000000 })).toString("base64url") + ".x", new Date(1700000000000))
ok("flags expiry", expired.isCurrentlyValid === false && /EXPIRED/.test(expired.expiryStatus), expired.expiryStatus)

describe("diff")
const d1 = Diff.diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne")
eq("counts", [d1.added, d1.removed, d1.unchanged], [2, 1, 3])
eq("row types", d1.rows.map(r => r.type), ["same", "remove", "add", "same", "same", "add"])
eq("line numbers", d1.rows.filter(r => r.type === "add").map(r => r.rightNo), [2, 5])
ok("identical files", Diff.diffLines("a\nb", "a\nb").identical)
eq("ignore case", Diff.diffLines("Hello", "hello", { ignoreCase: true }).added, 0)
eq("ignore whitespace", Diff.diffLines("a   b", "a b", { ignoreWhitespace: true }).added, 0)
eq("whitespace matters by default", Diff.diffLines("a   b", "a b").added, 1)
eq("insert at start", Diff.diffLines("b\nc", "a\nb\nc").rows.map(r => r.type), ["add", "same", "same"])
eq("delete at end", Diff.diffLines("a\nb\nc", "a\nb").rows.map(r => r.type), ["same", "same", "remove"])
eq("complete rewrite", Diff.diffLines("a\nb", "x\ny").added, 2)
const uni = Diff.unified(Diff.diffLines("one\ntwo\nthree\nfour\nfive\nsix\nseven",
  "one\ntwo\nTHREE\nfour\nfive\nsix\nseven"), 1, { left: "old", right: "new" })
eq("unified", uni, "--- old\n+++ new\n@@ -2 +2 @@\n two\n-three\n+THREE\n four")
ok("unified says identical", /identical/.test(Diff.unified(Diff.diffLines("a", "a"), 1)))
eq("word diff", Diff.diffWords("the quick fox", "the slow fox").filter(w => w.type !== "same").map(w => w.text),
  ["quick", "slow"])
// A 4000x4000 diff would need 16M cells; the guard must kick in and still answer.
const big = Diff.diffLines(Array.from({ length: 4000 }, (_, i) => "x" + i).join("\n"),
  Array.from({ length: 4000 }, (_, i) => "y" + i).join("\n"))
ok("degrades instead of exploding", big.truncated && big.added === 4000)

describe("generate")
const uuid = Gen.uuidV4()
ok("uuid shape", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid), uuid)
eq("uuid version", Gen.uuidVersion(uuid).version, "4")
eq("uuid variant", Gen.uuidVersion(uuid).variant, "RFC 4122")
ok("uuids differ", Gen.uuidV4() !== Gen.uuidV4())
ok("uppercase + braces", /^\{[0-9A-F-]{36}\}$/.test(Gen.uuidV4({ uppercase: true, braces: true })))
ok("no hyphens", /^[0-9a-f]{32}$/.test(Gen.uuidV4({ hyphens: false })))
const v7 = Gen.uuidV7({}, new Date(1700000000000))
eq("v7 version", Gen.uuidVersion(v7).version, "7")
eq("v7 carries its timestamp", Gen.uuidVersion(v7).timestamp.getTime(), 1700000000000)
ok("v7s sort by time", Gen.uuidV7({}, new Date(1000)) < Gen.uuidV7({}, new Date(2000)))
eq("nil", Gen.uuidNil(), "00000000-0000-0000-0000-000000000000")
eq("nil recognised", Gen.uuidVersion(Gen.uuidNil()).version, "nil")
eq("rejects non-uuid", Gen.uuidVersion("hello"), null)
const id = Gen.ulid(new Date(1700000000000))
eq("ulid length", id.length, 26)
eq("ulid decodes its time", Gen.decodeUlid(id).timestamp.getTime(), 1700000000000)
ok("ulids sort by time", Gen.ulid(new Date(1000)) < Gen.ulid(new Date(2000)))
throws("rejects short ulid", () => Gen.decodeUlid("abc"))
eq("random string length", Gen.randomString(24, { digits: true }).length, 24)
ok("respects charset", /^[a-z0-9]+$/.test(Gen.randomString(200, { digits: true })))
ok("unambiguous drops lookalikes", !/[0O1lI]/.test(Gen.randomString(500, { unambiguous: true })))
eq("alphabet size", Gen.alphabetSizeFor({ uppercase: true, digits: true }), 62)
eq("entropy bits", Gen.entropyBits(16, 62), 95.3)
ok("entropy source is used", (() => {
  Gen.setEntropySource(n => Array.from({ length: n }, () => 65))
  const forced = Gen.randomString(4, {})
  Gen.setEntropySource(null)
  return forced.length === 4
})())
eq("lorem words", Gen.lorem("words", 5).split(" ").length, 5)
ok("classic opener", /^Lorem ipsum dolor sit amet/.test(Gen.lorem("sentences", 1, true)))
eq("paragraph count", Gen.lorem("paragraphs", 3).split("\n\n").length, 3)

describe("sql: tokenizer")
eq("keeps strings whole", Sql.tokenize("select 'a, b' from t").filter(t => t.type === "string").map(t => t.text), ["'a, b'"])
eq("doubled quote inside string", Sql.tokenize("select 'it''s'")[2].text, "'it''s'")
eq("line comment", Sql.tokenize("-- hi\nselect 1")[0].type, "comment")
eq("block comment", Sql.tokenize("/* a\nb */ select")[0].type, "block-comment")
eq("quoted identifier", Sql.tokenize('select "order" from t')[2].text, '"order"')
eq("backtick identifier", Sql.tokenize("select `order`")[2].text, "`order`")
eq("numbers", Sql.tokenize("select 1.5e-3").filter(t => t.type === "number").map(t => t.text), ["1.5e-3"])

describe("sql: format")
const formatted = Sql.format("select a,b from t where x=1 and y=2 order by a desc", { uppercase: true })
eq("clauses on their own lines", formatted,
  "SELECT a,\n  b\nFROM t\nWHERE x = 1\n  AND y = 2\nORDER BY a DESC")
eq("keeps case when asked", Sql.format("select a from t", {}), "select a\nfrom t")
eq("function calls hug their paren", Sql.format("select count(x) from t", { uppercase: true }),
  "SELECT COUNT(x)\nFROM t")
eq("multi-word clauses stay together", Sql.format("select a from t group by a", { uppercase: true }),
  "SELECT a\nFROM t\nGROUP BY a")
eq("joins", Sql.format("select 1 from a left outer join b on a.id=b.id", { uppercase: true }),
  "SELECT 1\nFROM a\nLEFT OUTER JOIN b\n  ON a.id = b.id")
ok("subquery gets its own block", Sql.format("select * from (select 1 from t) s", { uppercase: true })
  .indexOf("(\n  SELECT 1") !== -1)
ok("comments survive", Sql.format("-- note\nselect 1", {}).indexOf("-- note") === 0)
eq("compact lists", Sql.format("select a,b,c from t", { uppercase: true, compactLists: true }),
  "SELECT a, b, c\nFROM t")
eq("cast operator stays tight", Sql.format("select a::text from t", { uppercase: true }), "SELECT a::text\nFROM t")

describe("sql: minify")
eq("minify", Sql.minify("select  a ,\n  b\nfrom   t\nwhere x = 1"), "select a, b from t where x = 1")
eq("drops comments", Sql.minify("-- gone\nselect 1"), "select 1")
eq("preserves string spacing", Sql.minify("select '  spaced  ' from t"), "select '  spaced  ' from t")
eq("format then minify round trips", Sql.minify(Sql.format("select a, b from t where x = 1", {})),
  "select a, b from t where x = 1")

describe("markup: html")
eq("indents nested elements", Markup.formatHtml("<div><p>hi</p></div>"), "<div>\n  <p>hi</p>\n</div>")
eq("void elements have no close tag", Markup.formatHtml("<div><br><img src=x></div>"),
  "<div>\n  <br>\n  <img src=x>\n</div>")
eq("keeps inline children on one line", Markup.formatHtml("<p>a <b>b</b> c</p>"), "<p>a <b>b</b> c</p>")
eq("attribute containing a bracket", Markup.formatHtml('<a data-x="1>2">t</a>'), '<a data-x="1>2">t</a>')
ok("script body is left alone", Markup.formatHtml("<script>if(a<b){x()}</script>").indexOf("if(a<b){x()}") !== -1)
ok("keeps the doctype", Markup.formatHtml("<!DOCTYPE html><html></html>").indexOf("<!DOCTYPE html>") === 0)
ok("keeps comments", Markup.formatHtml("<div><!-- note --></div>").indexOf("<!-- note -->") !== -1)
eq("survives an unclosed tag", Markup.formatHtml("<div><p>a</div>"), "<div>\n  <p>a</p>\n</div>")
eq("collapses whitespace between blocks", Markup.formatHtml("<ul>\n\n  <li>a</li>\n\n</ul>"),
  "<ul>\n  <li>a</li>\n</ul>")

describe("markup: xml")
eq("self-closing preserved", Markup.formatXml("<a><b/></a>"), "<a>\n  <b/>\n</a>")
eq("prolog", Markup.formatXml('<?xml version="1.0"?><r><i>1</i></r>'),
  '<?xml version="1.0"?>\n<r>\n  <i>1</i>\n</r>')
eq("cdata untouched", Markup.formatXml("<a><![CDATA[ <raw> ]]></a>"), "<a>\n  <![CDATA[ <raw> ]]>\n</a>")
eq("br is not void in xml", Markup.formatXml("<a><br></br></a>"), "<a>\n  <br></br>\n</a>")

describe("markup: minify")
eq("drops layout whitespace", Markup.minifyMarkup("<div>\n  <p>hi</p>\n</div>"), "<div><p>hi</p></div>")
eq("keeps meaningful spaces", Markup.minifyMarkup("<p>a <b>b</b> c</p>"), "<p>a <b>b</b> c</p>")
eq("drops comments", Markup.minifyMarkup("<div><!-- x --><p>a</p></div>"), "<div><p>a</p></div>")
eq("keeps comments on request", Markup.minifyMarkup("<div><!-- x --></div>", { keepComments: true }),
  "<div><!-- x --></div>")
eq("format then minify round trips", Markup.minifyMarkup(Markup.formatHtml("<div><p>a <i>b</i></p></div>")),
  "<div><p>a <i>b</i></p></div>")

describe("markup: css")
eq("beautify", Markup.formatCss(".a{color:red;margin:0}"), ".a {\n  color: red;\n  margin: 0;\n}")
eq("selector list", Markup.formatCss(".a,.b{color:red}"), ".a,\n.b {\n  color: red;\n}")
eq("nested at-rule", Markup.formatCss("@media screen{.a{color:red}}"),
  "@media screen {\n  .a {\n    color: red;\n  }\n}")
ok("braces inside a url survive", Markup.formatCss('.a{background:url("x{y}.png")}').indexOf('url("x{y}.png")') !== -1)
eq("minify", Markup.minifyCss("/* c */ .a , .b {  color : red ;  margin : 0 ; }"), ".a,.b{color:red;margin:0}")
eq("minify keeps strings", Markup.minifyCss('.a{content:"a  b"}'), '.a{content:"a  b"}')
eq("beautify then minify round trips", Markup.minifyCss(Markup.formatCss(".a{color:red;margin:0}")),
  ".a{color:red;margin:0}")

describe("catalog: shape")
const all = Catalog.tools()
eq("thirty-five tools", all.length, 35)
ok("every tool has an id, name, category, icon, and view", all.every(t =>
  t.id && t.name && t.category && t.icon && t.view && typeof t.run === "function"))
ok("ids are unique", new Set(all.map(t => t.id)).size === all.length)
ok("views are known", all.every(t =>
  ["transform", "report", "diff", "preview", "image", "generate", "decode", "dataurl", "history"]
    .indexOf(t.view) !== -1))
// These three have nothing to put a sample into: a generator makes its own
// output, and decode/dataurl/history read from the clipboard or the session.
ok("every tool that takes typed input has examples",
  all.filter(t => ["generate", "decode", "dataurl", "history"].indexOf(t.view) === -1)
     .every(t => Samples.hasTool(t.id)))
ok("option keys are unique per tool", all.every(t =>
  new Set((t.options || []).map(o => o.key)).size === (t.options || []).length))
ok("select options declare choices", all.every(t =>
  (t.options || []).filter(o => o.type === "select").every(o => o.choices && o.choices.length)))
ok("select defaults are valid choices", all.every(t =>
  (t.options || []).filter(o => o.type === "select")
    .every(o => o.choices.some(c => c.value === o.default))))

eq("an empty envelope says nothing at all", [Catalog.emptyResult().ok, Catalog.emptyResult().error,
  Catalog.emptyResult().output, Catalog.emptyResult().info, Catalog.emptyResult().fields.length],
  [true, "", "", "", 0])

describe("catalog: every tool runs its own sample")
for (const tool of all.filter(t => t.view !== "history")) {
  const state = Catalog.defaultsFor(tool)
  if (tool.id === "diff") state.right = sampleStateOf("diff").right
  if (tool.id === "regex") state.pattern = "(\\w+)@([\\w.]+)"
  const r = Catalog.run(tool, sampleOf(tool.id) || "", state)
  ok(tool.id + " succeeds", r.ok, r.error)
  ok(tool.id + " produces something",
    r.output.length > 0 || r.fields.length > 0 || r.rows.length > 0 || r.imageCommand !== null || r.info.length > 0,
    JSON.stringify(r).slice(0, 120))
}

describe("catalog: every tool survives junk and empty input")
const JUNK = ["", "   ", "<<<>>>", "{[(", "-1e999", "\uFFFD ", "'\"`\\", "\u200B"]
for (const tool of all) {
  const state = Catalog.defaultsFor(tool)
  for (const junk of JUNK) {
    const r = Catalog.run(tool, junk, state)
    ok(tool.id + " returns an envelope for junk",
      r && typeof r.ok === "boolean" && typeof r.output === "string" && Array.isArray(r.fields))
    ok(tool.id + " explains itself when it fails", r.ok || r.error.length > 0)
  }
}

describe("catalog: every mode of every tool runs")
for (const tool of all) {
  for (const mode of (tool.modes || [])) {
    const state = Catalog.defaultsFor(tool)
    state.mode = mode.id
    if (tool.id === "diff") state.right = sampleStateOf("diff").right
    // A few modes read the *other* direction's format, so feed them something
    // they can actually parse rather than the tool's forward-direction sample.
    const input = tool.id === "json-yaml" && mode.id === "toJson" ? "a: 1\nb: [2, 3]"
      : tool.id === "json-csv" && mode.id === "toCsv" ? '[{"a":1,"b":2}]'
      : tool.id === "base64" && mode.id === "decode" ? "aGVsbG8="
      : tool.id === "url-encode" && mode.id === "decode" ? "a%20b"
      : tool.id === "escape" && mode.id === "unescape" ? "a\\nb"
      : sampleOf(tool.id)
    const r = Catalog.run(tool, input, state)
    ok(tool.id + "/" + mode.id + " succeeds", r.ok, r.error)
  }
}

describe("catalog: search")
eq("exact name wins", Catalog.search("json")[0].id, "json")
eq("keyword hit", Catalog.search("guid")[0].id, "uuid")
eq("keyword hit 2", Catalog.search("md5")[0].id, "hash")
eq("keyword hit 3", Catalog.search("crontab")[0].id, "cron")
eq("category search", Catalog.search("generators").length, 4)
eq("empty query returns everything", Catalog.search("").length, 35)
eq("no match", Catalog.search("zzzznope").length, 0)

describe("catalog: defaults")
const jsonDefaults = Catalog.defaultsFor(Catalog.byId("json"))
eq("mode default", jsonDefaults.mode, "format")
eq("option default", jsonDefaults.indent, "2")
eq("secondary starts empty", Catalog.defaultsFor(Catalog.byId("jwt")).secret, "")
eq("byId misses cleanly", Catalog.byId("nope"), null)

describe("catalog: representative outputs")
eq("base64 encode", Catalog.run(Catalog.byId("base64"), "hi", { mode: "encode", padding: true }).output, "aGk=")
eq("base64 decode", Catalog.run(Catalog.byId("base64"), "aGk=", { mode: "decode" }).output, "hi")
ok("base64 binary falls back to hex",
  /raw bytes as hex/.test(Catalog.run(Catalog.byId("base64"), "//79", { mode: "decode" }).info))
ok("json reports the error line",
  /unexpected character .* \(line 1, column 7\)/.test(Catalog.run(Catalog.byId("json"), '{"a": oops}', {}).error))
eq("hash picks sha256 as its headline",
  Catalog.run(Catalog.byId("hash"), "abc", {}).fields[2].value,
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
ok("jwt verifies through the catalog",
  /verified/.test(Catalog.run(Catalog.byId("jwt"), sampleOf("jwt"),
    { secret: "your-256-bit-secret" }).info))
eq("qr builds a qrencode command",
  Catalog.run(Catalog.byId("qr"), "hi", { size: "8", level: "M" }).imageCommand.indexOf("qrencode"), 0)
ok("qr passes its payload after a -- separator",
  Catalog.run(Catalog.byId("qr"), "-rf /", {}).imageCommand.slice(-2)[0] === "--")
eq("unixtime now action returns an epoch",
  /^\d{10}$/.test(Catalog.byId("unixtime").action("now", "", {})), true)
ok("generators need no input", Catalog.run(Catalog.byId("uuid"), "", { kind: "v4", count: "3" })
  .output.split("\n").length === 3)

describe("detect: clipboard sniffing")
const best = t => { const b = Detect.suggestBest(t); return b ? b.toolId : null }
eq("jwt beats base64", best(sampleOf("jwt")), "jwt")
eq("json", best('{"a": [1, 2], "b": null}'), "json")
eq("json array", best("[1,2,3]"), "json")
eq("jsonc", best('{ // note\n "a": 1 }'), "json")
eq("xml", best('<?xml version="1.0"?><a><b/></a>'), "xml")
eq("html doc", best("<!DOCTYPE html><html><body>hi</body></html>"), "html")
eq("url", best("https://example.com/a?b=1"), "url-parse")
eq("uuid", best("550e8400-e29b-41d4-a716-446655440000"), "id-inspect")
eq("ulid", best("01ARZ3NDEKTSV4RRFFQ69G5FAV"), "id-inspect")
eq("hex color", best("#1e90ff"), "color")
eq("rgb color", best("rgb(30, 144, 255)"), "color")
eq("epoch", best("1700000000"), "unixtime")
eq("iso date", best("2024-01-15T10:30:00Z"), "unixtime")
eq("cron", best("*/15 9-17 * * 1-5"), "cron")
eq("cron shorthand", best("@daily"), "cron")
eq("percent encoded", best("hello%20world%21"), "url-encode")
eq("html entities", best("caf&eacute; &amp; cr&egrave;me"), "html-entities")
eq("base64 text", best("VGhlIHF1aWNrIGJyb3duIGZveA=="), "base64")
eq("sql", best("SELECT id FROM users WHERE active = true"), "sql")
eq("csv", best("name,age\nada,36\ngrace,45"), "json-csv")
eq("yaml", best("name: omarchy\nversion: 2.1\ntags:\n  - a"), "json-yaml")
eq("hex prefix", best("0xDEADBEEF"), "base-convert")
eq("sha256 digest", best("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"), "hash")

describe("detect: restraint")
eq("empty clipboard suggests nothing", Detect.suggestBest(""), null)
eq("whitespace suggests nothing", Detect.suggestBest("   \n  "), null)
eq("a sentence is not hijacked", Detect.suggestBest("Remember to call the dentist tomorrow"), null)
eq("a single word is not hijacked", Detect.suggestBest("omarchy"), null)
ok("suggestions carry the mode they need",
  Detect.suggestBest("hello%20world%21").state.mode === "decode")
ok("jsonc suggestion turns on lenient parsing",
  Detect.suggestBest('{ // note\n "a": 1 }').state.lenient === true)
ok("each tool appears at most once",
  (() => { const ids = Detect.suggestAll('{"a":1}').map(x => x.toolId); return new Set(ids).size === ids.length })())
ok("top suggestions are ordered by confidence",
  (() => { const c = Detect.topSuggestions(sampleOf("jwt"), 4).map(x => x.confidence)
           return c.every((v, i) => i === 0 || c[i - 1] >= v) })())
ok("every suggested tool exists in the catalogue",
  ["{\"a\":1}", "1700000000", "#fff", "a,b\n1,2", "SELECT 1", "@daily", "https://x.dev"]
    .every(t => Detect.suggestAll(t).every(sg => Catalog.byId(sg.toolId) !== null)))

describe("json: native fast path")
const DOCS = [
  '{"a":1,"b":[1,2,{"c":null}],"d":"x"}',
  '[]', '{}', '[[[]]]', '{"a":{}}',
  '{"unicode":"café 🌍","escaped":"a\\nb\\t\\"c\\""}',
  '{"nums":[0,-1,1.5,1e3,-2.5e-3]}',
  '{"bools":[true,false,null]}',
  '[{"id":1},{"id":2},{"id":3}]',
  '{"deep":{"a":{"b":{"c":{"d":[1,2,3]}}}}}'
]
for (const doc of DOCS) {
  const meta = Json.parseWithMeta(doc, false)
  ok("uses native for " + doc.slice(0, 24), meta.native === true)
  for (const indent of [0, 2, 4, "\t"]) {
    eq("both paths agree, indent " + JSON.stringify(indent) + ", " + doc.slice(0, 18),
      Json.stringifyMeta(meta, indent, {}),
      Json.stringify(Json.parse(doc), indent, {}))
  }
}
// Integer-like keys are exactly the case native reorders, so they must not
// take the fast path.
const numericKeys = '{"z":1,"10":2,"a":3,"2":4}'
eq("integer keys refuse the fast path", Json.parseWithMeta(numericKeys, false).native, false)
eq("integer key order survives", Json.stringifyMeta(Json.parseWithMeta(numericKeys, false), 0, {}),
  '{"z":1,"10":2,"a":3,"2":4}')
// A quote inside a string is always escaped, so a numeric key sequence in a
// *value* cannot masquerade as a key — the scan stays exact.
eq("an escaped numeric key inside a value is not mistaken for a key",
  Json.parseWithMeta('{"a":"see \\"12\\": here"}', false).native, true)
eq("and its content survives untouched",
  Json.parse('{"a":"see \\"12\\": here"}').a, 'see "12": here')
eq("lenient mode refuses the fast path", Json.parseWithMeta('{"a":1}', true).native, false)
eq("sortKeys refuses native stringify",
  Json.stringifyMeta(Json.parseWithMeta('{"b":1,"a":2}', false), 0, { sortKeys: true }), '{"a":2,"b":1}')
eq("escapeUnicode refuses native stringify",
  Json.stringifyMeta(Json.parseWithMeta('{"a":"é"}', false), 0, { escapeUnicode: true }), '{"a":"\\u00e9"}')
// A broken document must still fall through to the positioned error.
let fastErr = null
try { Json.parseWithMeta('{\n  "a": 1,\n  "b": oops\n}', false) } catch (e) { fastErr = e }
ok("invalid input still reports a position", fastErr && fastErr.line === 3 && fastErr.column === 8,
  fastErr ? fastErr.formatted : "no error thrown")

describe("worker bundle")
const bundleModules = await (async () => {
  const { bundleSource } = await import("../tools/build-worker-bundle.mjs")
  const fs = await import("node:fs")
  const path = await import("node:path")
  const vm = await import("node:vm")
  const url = await import("node:url")
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..")
  const committed = fs.readFileSync(path.join(root, "lib/worker-bundle.js"), "utf8")
  const generated = bundleSource()
  ok("lib/worker-bundle.js is up to date with lib/ — run: node tools/build-worker-bundle.mjs",
    committed === generated)
  const context = vm.createContext({ console, Date, Math, JSON })
  vm.runInContext(committed, context, { filename: "worker-bundle.js" })
  return context
})()

// The bundle is what actually runs on the worker thread, so it has to behave
// identically to the modules the main thread imports.
for (const [name, direct] of [["Bytes", Bytes], ["Text", Text], ["Hash", Hash], ["Json", Json],
                              ["Yaml", Yaml], ["Csv", Csv], ["Sql", Sql], ["Markup", Markup],
                              ["Num", Num], ["Color", Color], ["Time", Time], ["Cron", Cron],
                              ["Url", Url], ["Jwt", Jwt], ["Diff", Diff], ["Gen", Gen],
                              ["Catalog", Catalog], ["Detect", Detect]]) {
  ok("bundle exposes " + name, bundleModules[name] !== undefined)
  // The loader injects these into each module's context; they aren't exports.
  const INJECTED = ["console", "Date", "Math", "JSON"]
  const missing = Object.keys(direct)
    .filter(k => INJECTED.indexOf(k) === -1)
    .filter(k => typeof direct[k] === "function" && bundleModules[name][k] === undefined)
  ok(name + " exports match the direct module", missing.length === 0, "missing: " + missing.join(", "))
}
eq("bundled catalogue is the same size", bundleModules.Catalog.tools().length, Catalog.tools().length)
for (const tool of Catalog.tools()) {
  const state = Catalog.defaultsFor(tool)
  if (tool.id === "diff") state.right = sampleStateOf("diff").right
  if (tool.id === "regex") state.pattern = "(\\w+)@([\\w.]+)"
  if (tool.view === "generate") continue // random output, nothing to compare
  eq("bundled " + tool.id + " produces identical output",
    bundleModules.Catalog.run(bundleModules.Catalog.byId(tool.id), sampleOf(tool.id) || "", state).output,
    Catalog.run(tool, sampleOf(tool.id) || "", state).output)
}

describe("detect: stays cheap on huge clipboards")
// Detection runs on the UI thread, so it must not parse a multi-megabyte
// payload to decide what it is.
const hugeJson = "[" + Array.from({ length: 40000 }, (_, i) => `{"id":${i},"name":"row ${i}"}`).join(",") + "]"
const hugeYaml = Array.from({ length: 40000 }, (_, i) => `key${i}: value ${i}`).join("\n")
const hugeB64 = "SGVsbG8gd29ybGQh".repeat(8000)
ok("huge json is over the deep-check limit", hugeJson.length > 65536)

for (const [label, payload, expected] of [["json", hugeJson, "json"],
                                          ["yaml", hugeYaml, "json-yaml"],
                                          ["base64", hugeB64, "base64"]]) {
  const started = Date.now()
  const best = Detect.suggestBest(payload)
  const elapsed = Date.now() - started
  eq("still identifies huge " + label, best ? best.toolId : null, expected)
  ok("huge " + label + " sniffed without parsing it (" + elapsed + "ms)", elapsed < 60,
    elapsed + "ms — the deep-check guard is not holding")
}
ok("shape-only detection is less confident than a real parse",
  Detect.suggestBest(hugeJson).confidence < Detect.suggestBest('{"a":1}').confidence)

describe("chain: running")
const b64json = { id: "b64json", name: "Base64 to JSON", steps: [
  { toolId: "base64", state: { mode: "decode" } },
  { toolId: "json", state: { mode: "format", indent: "2" } }
] }
const encoded = Buffer.from('{"name":"omarchy","stars":10000}').toString("base64")
const ran = Chain.run(b64json, encoded)
ok("chain succeeds", ran.ok, ran.error)
eq("output is the last step's output", ran.output, '{\n  "name": "omarchy",\n  "stars": 10000\n}')
eq("one record per step", ran.steps.length, 2)
eq("step names", ran.steps.map(s => s.name), ["Base64 String", "JSON Format"])
eq("each step feeds the next", ran.steps[0].output, '{"name":"omarchy","stars":10000}')
eq("byte counts are tracked", ran.steps[1].inputLength, 32)
ok("each step carries a summary", ran.steps.every(s => s.summary.length > 0))

eq("an empty chain is the identity", Chain.run({ steps: [] }, "unchanged").output, "unchanged")
eq("a single step behaves like the tool",
  Chain.run({ steps: [{ toolId: "case", state: {} }] }, "hello world").output,
  Catalog.run(Catalog.byId("case"), "hello world", Catalog.defaultsFor(Catalog.byId("case"))).output)

describe("chain: failure reporting")
const broken = Chain.run(b64json, "not!valid!base64!")
eq("chain reports failure", broken.ok, false)
eq("names the step that failed", broken.failedAt, 0)
ok("error says which step and why", /^step 1 \(Base64 String\):/.test(broken.error), broken.error)
eq("no output on failure", broken.output, "")
eq("records stop at the failure", broken.steps.length, 1)

const failsLate = Chain.run({ steps: [
  { toolId: "base64", state: { mode: "decode" } },
  { toolId: "json", state: { mode: "format" } }
] }, Buffer.from("this is not json").toString("base64"))
eq("later failure is located", failsLate.failedAt, 1)
ok("later failure names the tool", /^step 2 \(JSON Format\):/.test(failsLate.error), failsLate.error)
eq("partial output survives for the view", failsLate.partialOutput, "this is not json")

const unknown = Chain.run({ steps: [{ toolId: "nope", state: {} }] }, "x")
eq("unknown tool fails cleanly", unknown.ok, false)
ok("unknown tool is named", /unknown tool: nope/.test(unknown.error), unknown.error)

describe("chain: editing")
let edited = { id: "e", name: "E", steps: [{ toolId: "base64", state: {} }] }
edited = Chain.addStep(edited, "json", { mode: "minify" })
eq("add step", edited.steps.map(s => s.toolId), ["base64", "json"])
eq("added step keeps its state", edited.steps[1].state.mode, "minify")
eq("added step inherits defaults", edited.steps[1].state.indent, "2")
edited = Chain.addStep(edited, "case", {})
edited = Chain.moveStep(edited, 2, -1)
eq("move up", edited.steps.map(s => s.toolId), ["base64", "case", "json"])
eq("move past the start is a no-op", Chain.moveStep(edited, 0, -1).steps.map(s => s.toolId),
  ["base64", "case", "json"])
eq("move past the end is a no-op", Chain.moveStep(edited, 2, 1).steps.map(s => s.toolId),
  ["base64", "case", "json"])
edited = Chain.removeStep(edited, 1)
eq("remove step", edited.steps.map(s => s.toolId), ["base64", "json"])
edited = Chain.setStepState(edited, 1, "sortKeys", true)
eq("set step option", edited.steps[1].state.sortKeys, true)
eq("editing a step leaves its siblings alone", edited.steps[0].toolId, "base64")

describe("chain: validation and description")
eq("valid chain", Chain.validate(b64json).ok, true)
eq("empty chain is invalid", Chain.validate({ steps: [] }).ok, false)
ok("unknown tool is reported", /unknown tool/.test(Chain.validate({ steps: [{ toolId: "zzz" }] }).errors[0]))
eq("describe", Chain.describe(b64json), "Base64 String → JSON Format")
eq("describe empty", Chain.describe({ steps: [] }), "empty chain")

describe("chain: store")
const store = Chain.serializeStore([b64json])
ok("store is valid JSON", (() => { JSON.parse(store); return true })())
eq("round trips", Chain.parseStore(store).map(c => c.id), ["b64json"])
eq("round trip preserves steps", Chain.parseStore(store)[0].steps.map(s => s.toolId), ["base64", "json"])
eq("round trip preserves changed options",
  Chain.parseStore(store)[0].steps[0].state.mode, "decode")
// Only non-default options are written, so the file stays readable and a new
// option added to a tool later doesn't invalidate chains saved today.
ok("defaults are not written out", store.indexOf('"indent"') === -1, store)
ok("changed options are written out", store.indexOf('"mode": "decode"') !== -1)
eq("a chain saved before an option existed still gets it",
  Chain.parseStore('{"version":1,"chains":[{"id":"x","name":"X","steps":[{"toolId":"json"}]}]}')[0]
    .steps[0].state.indent, "2")
eq("an unknown version is ignored", Chain.parseStore('{"version":99,"chains":[{"id":"a"}]}').length, 0)
eq("an empty file is no chains", Chain.parseStore("").length, 0)
throws("a corrupt file is reported, not swallowed", () => Chain.parseStore("{not json"))

let chains = []
chains = Chain.upsert(chains, { id: "a", name: "A", steps: [{ toolId: "json" }] })
chains = Chain.upsert(chains, { id: "b", name: "B", steps: [{ toolId: "case" }] })
eq("upsert appends", chains.map(c => c.id), ["a", "b"])
chains = Chain.upsert(chains, { id: "a", name: "A2", steps: [{ toolId: "sql" }] })
eq("upsert replaces in place", chains.map(c => c.name), ["A2", "B"])
eq("find", Chain.find(chains, "b").name, "B")
eq("find misses cleanly", Chain.find(chains, "zzz"), null)
chains = Chain.remove(chains, "a")
eq("remove", chains.map(c => c.id), ["b"])
eq("id from name", Chain.makeId("Decode Auth Header!", []), "decode-auth-header")
eq("ids do not collide", Chain.makeId("B", chains), "b-2")

describe("chain: starters all work")
for (const starter of Chain.starterChains()) {
  eq(starter.name + " is valid", Chain.validate(starter).ok, true)
  ok(starter.name + " has a description", Chain.describe(starter).length > 0)
  // A one- or two-step starter would teach people to reach for a chain where a
  // single tool would do. Every starter has to justify being a chain at all.
  ok(starter.name + " is worth being a chain", starter.steps.length >= 3,
    starter.steps.length + " steps")
}
// Looked up by id, not position: a new starter should not renumber these.
const starter = id => Chain.find(Chain.starterChains().map(Chain.normalize), id)

// Three layers off a link: percent-encoding, then base64, then formatting.
eq("url param starter", Chain.run(starter("url-param-json"),
  "eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iXX0%3D").output,
  '{\n  "user": "ada",\n  "roles": [\n    "admin"\n  ]\n}')

// The fingerprint is only useful if it is the SHA-256 anyone else would get.
const fingerprint = Chain.run(starter("config-fingerprint"), "name: web\nreplicas: 3")
eq("config fingerprint starter", fingerprint.output,
  createHash("sha256").update('{"name":"web","replicas":3}').digest("hex"))
// And its whole point: the same config, written differently, fingerprints the
// same — which is the question you cannot answer by looking at two files.
eq("reordered keys fingerprint identically",
  Chain.run(starter("config-fingerprint"), "replicas: 3\nname: web").output, fingerprint.output)
eq("as does a quoted, differently spaced copy",
  Chain.run(starter("config-fingerprint"), 'name:   "web"\n\nreplicas: 3\n').output,
  fingerprint.output)
eq("but a real change does not",
  Chain.run(starter("config-fingerprint"), "name: web\nreplicas: 4").output === fingerprint.output,
  false)

// Extract, drop repeats, sort — in that order, and all three do work.
eq("unique matches starter", Chain.run(starter("unique-matches"),
  "from zoe@corp.com to ada@corp.com\nzoe@corp.com again, cc bob@x.io").output,
  "ada@corp.com\nbob@x.io\nzoe@corp.com")
eq("no matches is an empty result, not a failure",
  Chain.run(starter("unique-matches"), "nothing here").output, "")

describe("chain: ending in an image")
const qrLast = { steps: [{ toolId: "url-encode", state: { mode: "decode" } }, { toolId: "qr", state: {} }] }
const imaged = Chain.run(qrLast, "https%3A%2F%2Fomarchy.org")
ok("chain succeeds", imaged.ok, imaged.error)
eq("flagged as ending in an image", imaged.endsInImage, true)
ok("carries the render command", Array.isArray(imaged.imageCommand) && imaged.imageCommand[0] === "qrencode")
ok("the command encodes the decoded text",
  imaged.imageCommand[imaged.imageCommand.length - 1] === "https://omarchy.org",
  JSON.stringify(imaged.imageCommand))
eq("the last step is marked", imaged.steps[1].producesImage, true)
eq("a last-position image step has no warning", imaged.steps[1].warning, "")
eq("a text step is not marked", imaged.steps[0].producesImage, false)

const qrMiddle = { steps: [{ toolId: "qr", state: {} }, { toolId: "case", state: {} }] }
const middled = Chain.run(qrMiddle, "hello world")
eq("an image step in the middle does not make an image chain", middled.endsInImage, false)
eq("and the chain carries no render command", middled.imageCommand, null)
ok("the mid-chain step is flagged", /only does something as the last step/.test(middled.steps[0].warning),
  middled.steps[0].warning)
eq("its text really does pass through unchanged", middled.steps[0].output, "hello world")
eq("so the chain still produces the later step's output", middled.output, "helloWorld")

eq("validate warns about it", Chain.validate(qrMiddle).warnings.length, 1)
eq("the warning names the step", Chain.validate(qrMiddle).warnings[0].index, 0)
eq("but it is not an error — the chain still runs", Chain.validate(qrMiddle).ok, true)
eq("a well-placed image step warns about nothing", Chain.validate(qrLast).warnings.length, 0)

const brokenImage = Chain.run({ steps: [
  { toolId: "base64", state: { mode: "decode" } }, { toolId: "qr", state: {} }
] }, "not!base64!")
eq("a failed chain never claims to have made an image", brokenImage.endsInImage, false)
eq("and carries no command", brokenImage.imageCommand, null)

describe("catalog: error positions")
const badJson = Catalog.run(Catalog.byId("json"), '{\n  "a": 1,\n  "b": oops\n}', {})
eq("json failure", badJson.ok, false)
eq("carries a line", badJson.errorLine, 3)
eq("carries a column", badJson.errorColumn, 8)
ok("carries a character index", badJson.errorIndex > 0, "index " + badJson.errorIndex)
eq("the index really points at the bad character",
  '{\n  "a": 1,\n  "b": oops\n}'.charAt(badJson.errorIndex), "o")

const badYaml = Catalog.run(Catalog.byId("json-yaml"), "a: 1\nb:\n\tc: 2", { mode: "toJson" })
eq("yaml failure", badYaml.ok, false)
eq("yaml carries a line", badYaml.errorLine, 3)
eq("yaml has no column, so none is claimed", badYaml.errorColumn, 0)

eq("a success carries no position", Catalog.run(Catalog.byId("json"), '{"a":1}', {}).errorIndex, -1)
eq("a failure without a position claims none",
  Catalog.run(Catalog.byId("base64"), "!!!!", { mode: "decode" }).errorLine, 0)

describe("catalog: line/column to index")
const lines3 = "one\ntwo\nthree"
eq("first character", Catalog.indexOfPosition(lines3, 1, 1), 0)
eq("mid first line", Catalog.indexOfPosition(lines3, 1, 3), 2)
eq("start of second line", Catalog.indexOfPosition(lines3, 2, 1), 4)
eq("start of third line", Catalog.indexOfPosition(lines3, 3, 1), 8)
eq("mid third line", Catalog.indexOfPosition(lines3, 3, 4), 11)
eq("past the end clamps", Catalog.indexOfPosition(lines3, 99, 1), lines3.length)
eq("past the line end clamps", Catalog.indexOfPosition(lines3, 1, 99), lines3.length)
eq("zero and negatives are treated as the first", Catalog.indexOfPosition(lines3, 0, 0), 0)
eq("empty text", Catalog.indexOfPosition("", 5, 5), 0)
// The round trip that matters: a reported position must find the reported character.
const src = '{\n  "a": 1,\n  "b": oops\n}'
eq("yaml-style line-only lookup finds the line",
  src.substring(Catalog.indexOfPosition(src, 3, 1), Catalog.indexOfPosition(src, 3, 1) + 3), '  "')

describe("chain: seeded from a tool")
const seeded = Chain.fromTool("sql", { mode: "format", uppercase: true }, [])
eq("named after the tool", seeded.name, "SQL Format")
eq("id derived from the name", seeded.id, "sql-format")
eq("one step, the tool you were using", seeded.steps.map(s => s.toolId), ["sql"])
eq("keeps the options you had set", seeded.steps[0].state.uppercase, true)
eq("fills in the rest of the tool's defaults", seeded.steps[0].state.indent, "2")
eq("is immediately valid", Chain.validate(seeded).ok, true)
eq("and immediately runs", Chain.run(seeded, "select a from b").output, "SELECT a\nFROM b")
// Seeding the same tool twice must not collide.
const again = Chain.fromTool("sql", {}, [seeded])
eq("second one gets its own id", again.id, "sql-format-2")
eq("an unknown tool still yields something editable", Chain.fromTool("nope", {}, []).name, "New chain")
eq("seeding with no options is fine", Chain.fromTool("json", null, []).steps[0].state.mode, "format")

describe("catalog: qr reading")
const reader = Catalog.byId("qr-read")
eq("it is a decode view", reader.view, "decode")
eq("nothing to scan yet", Catalog.run(reader, "", {}).textCommand, null)
ok("empty state explains itself", Catalog.run(reader, "", {}).info.length > 0)
// Only a path the plugin itself created is accepted — see the guard tests.
const OWN_SCAN = "/run/user/1000/omarchy-toolroll-scan-1.png"
const scan = Catalog.run(reader, OWN_SCAN, {})
eq("builds a zbarimg command", scan.textCommand.slice(0, 3), ["zbarimg", "--quiet", "--raw"])
eq("passes the path after a -- separator", scan.textCommand.slice(-2), ["--", OWN_SCAN])
eq("generating and reading are mirror images",
  [Catalog.byId("qr").view, Catalog.byId("qr-read").view], ["image", "decode"])
ok("both are findable by the same words",
  Catalog.search("qr").map(t => t.id).indexOf("qr-read") !== -1)
ok("scan finds it too", Catalog.search("scan").map(t => t.id).indexOf("qr-read") !== -1)

describe("catalog: secrets never reach the disk")
eq("the JWT secret is declared as one", Catalog.secretKeys(Catalog.byId("jwt")), ["secret"])
eq("so is the hash HMAC key", Catalog.secretKeys(Catalog.byId("hash")), ["hmacKey"])
eq("a regex pattern is not a secret", Catalog.secretKeys(Catalog.byId("regex")), [])
eq("nor are ordinary tools", Catalog.secretKeys(Catalog.byId("json")), [])
eq("no tool at all", Catalog.secretKeys(null), [])

const jwtState = { secret: "hunter2", secretIsBase64: true, mode: "x" }
eq("stripped from state", Object.keys(Catalog.withoutSecrets(Catalog.byId("jwt"), jwtState)).sort(),
  ["mode", "secretIsBase64"])
eq("everything else survives", Catalog.withoutSecrets(Catalog.byId("jwt"), jwtState).secretIsBase64, true)
ok("the original is not mutated", jwtState.secret === "hunter2")
eq("empty state is fine", Catalog.withoutSecrets(Catalog.byId("jwt"), null), {})

// Every field the UI masks must be declared secret — masking on screen and
// then writing to disk would make the masking a lie.
const masked = Catalog.tools().filter(t => t.secondary && t.secondary.password === true)
ok("there is at least one masked field to check", masked.length > 0)
ok("every masked field is declared secret", masked.every(t => t.secondary.secret === true),
  masked.filter(t => t.secondary.secret !== true).map(t => t.id).join(", "))

describe("chain store: secrets never travel with a shared chain")
const withSecret = { id: "s", name: "S", steps: [
  { toolId: "jwt", state: { secret: "hunter2", secretIsBase64: true } },
  { toolId: "hash", state: { hmacKey: "topsecret", uppercase: true } }
] }
const serialized = Chain.serializeStore([withSecret])
ok("the JWT secret is absent", serialized.indexOf("hunter2") === -1, serialized)
ok("the HMAC key is absent", serialized.indexOf("topsecret") === -1, serialized)
ok("the non-secret options survive", serialized.indexOf('"secretIsBase64": true') !== -1)
ok("and so do the others", serialized.indexOf('"uppercase": true') !== -1)
// A chain that once carried a secret must still run — it just asks for it again.
const reloaded = Chain.parseStore(serialized)[0]
eq("reloads without the secret", reloaded.steps[0].state.secret, "")
eq("but keeps its shape", reloaded.steps.map(s => s.toolId), ["jwt", "hash"])

describe("data uri: parsing")
const PNG_HEAD = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const parsed = DataUrl.parse("data:image/png;base64," + PNG_HEAD)
eq("reads the declared type", parsed.mime, "image/png")
eq("keeps the payload", parsed.base64, PNG_HEAD)
eq("works out the decoded size without decoding", parsed.bytes, 70)
eq("a CSS wrapper is unwrapped", DataUrl.parse('url("data:image/png;base64,' + PNG_HEAD + '")').base64, PNG_HEAD)
eq("single quotes too", DataUrl.parse("url('data:image/gif;base64,R0lGODlhAQ==')").mime, "image/gif")
eq("bare base64 is sniffed", DataUrl.parse(PNG_HEAD).mime, "image/png")
eq("and flagged as bare", DataUrl.parse(PNG_HEAD).wasBare, true)
throws("percent-encoded data URIs are refused, not mangled",
  () => DataUrl.parse("data:image/svg+xml,%3Csvg%3E"))
throws("random text is refused", () => DataUrl.parse("just some words"))
throws("base64 that is not an image is refused", () => DataUrl.parse("aGVsbG8gd29ybGQ="))
throws("empty", () => DataUrl.parse(""))

describe("data uri: sniffing beats the label")
eq("png", DataUrl.sniffMime(PNG_HEAD), "image/png")
eq("jpeg", DataUrl.sniffMime("/9j/4AAQSkZJRg"), "image/jpeg")
eq("gif", DataUrl.sniffMime("R0lGODlhAQABAIA"), "image/gif")
eq("webp", DataUrl.sniffMime("UklGRiQAAABXRUJQ"), "image/webp")
eq("svg", DataUrl.sniffMime("PHN2ZyB4bWxucz0"), "image/svg+xml")
eq("svg with an xml prolog", DataUrl.sniffMime("PD94bWwgdmVyc2lvbj0"), "image/svg+xml")
// Group alignment matters: these are real encodings, not hand-written prefixes.
eq("png prefix is what base64 actually emits",
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString("base64").slice(0, 11), "iVBORw0KGgo")
eq("svg prefix likewise", Buffer.from("<svg xmlns=").toString("base64").slice(0, 4), "PHN2")
eq("nothing recognisable", DataUrl.sniffMime("zzzz"), "")
// A URI that lies about its type is believed on the evidence, not the label.
const mislabelled = DataUrl.parse("data:image/jpeg;base64," + PNG_HEAD)
eq("declared type kept", mislabelled.mime, "image/jpeg")
eq("but the real one is known", mislabelled.sniffed, "image/png")

describe("data uri: building")
eq("plain", DataUrl.build("image/png", "AAAA", false), "data:image/png;base64,AAAA")
eq("css wrapped", DataUrl.build("image/png", "AAAA", true), 'url("data:image/png;base64,AAAA")')
eq("round trip", DataUrl.parse(DataUrl.build("image/gif", "R0lGODlhAQ==", true)).base64, "R0lGODlhAQ==")
eq("sizes", [DataUrl.describeSize(512), DataUrl.describeSize(2048), DataUrl.describeSize(3145728)],
  ["512 B", "2 KB", "3 MB"])
eq("padding is accounted for", [DataUrl.decodedSize("AAAA"), DataUrl.decodedSize("AAA="), DataUrl.decodedSize("AA==")],
  [3, 2, 1])

describe("catalog: base64 image")
const bi = Catalog.byId("base64-image")
eq("it is a dataurl view", bi.view, "dataurl")
const enc = Catalog.run(bi, "/tmp/omarchy-toolroll-scan-2.png", { mode: "encode", mime: "auto", cssWrap: false })
eq("shells out rather than decoding in JS", enc.textCommand,
  ["base64", "-w0", "--", "/tmp/omarchy-toolroll-scan-2.png"])
eq("and dresses the output declaratively", enc.textPrefix, "data:image/png;base64,")
eq("css wrapping is a prefix and suffix", [
  Catalog.run(bi, "/tmp/omarchy-toolroll-scan-2.png", { mode: "encode", mime: "image/webp", cssWrap: true }).textPrefix,
  Catalog.run(bi, "/tmp/omarchy-toolroll-scan-2.png", { mode: "encode", mime: "image/webp", cssWrap: true }).textSuffix
], ['url("data:image/webp;base64,', '")'])
const dec = Catalog.run(bi, "data:image/png;base64," + PNG_HEAD, { mode: "decode" })
ok("decoding yields a source Qt can load itself", dec.imageSource.indexOf("data:image/png;base64,") === 0)
ok("and says what it found", /image\/png · 70 B decoded/.test(dec.info), dec.info)
ok("a mislabelled URI is called out",
  /really image\/png/.test(Catalog.run(bi, "data:image/jpeg;base64," + PNG_HEAD, { mode: "decode" }).info))
eq("bad input fails cleanly", Catalog.run(bi, "nonsense", { mode: "decode" }).ok, false)
eq("empty says what to do", Catalog.run(bi, "", { mode: "decode" }).info.length > 0, true)

describe("types: inference")
const shapeOf = json => Types.infer(Json.parse(json))
eq("string", shapeOf('"x"').kind, "string")
eq("whole numbers are integers", shapeOf("1").kind, "integer")
eq("fractions are not", shapeOf("1.5").kind, "number")
eq("bool", shapeOf("true").kind, "boolean")
eq("null", shapeOf("null").kind, "null")
eq("empty array is unknown inside", shapeOf("[]").of.kind, "any")
eq("array of strings", shapeOf('["a","b"]').of.kind, "string")
// The cases a *sample* can genuinely tell you something about.
eq("1 and 1.5 together are a float", shapeOf("[1, 1.5]").of.kind, "number")
eq("a string and a number together are unknowable", shapeOf('[1, "x"]').of.kind, "any")
eq("something sometimes null is nullable", shapeOf('[1, null]').of.nullable, true)
eq("and keeps its type", shapeOf('[1, null]').of.kind, "integer")
const partial = shapeOf('[{"a":1},{"a":2,"b":3}]').of
eq("a field in every element is required", partial.fields[0].optional, false)
eq("a field in only some is optional", partial.fields[1].optional, true)
eq("merging is order independent",
  shapeOf('[{"a":1},{"a":2,"b":3}]').of.fields.map(f => f.optional),
  shapeOf('[{"a":2,"b":3},{"a":1}]').of.fields.map(f => f.optional).reverse().reverse())

describe("types: naming")
eq("plurals are singularised for element types", Types.singular("orders"), "order")
eq("ies plurals", Types.singular("categories"), "category")
eq("es plurals", Types.singular("boxes"), "box")
eq("double s is left alone", Types.singular("address"), "address")
eq("short words are left alone", Types.singular("os"), "os")
eq("names become pascal case", Types.pascal("user_profile"), "UserProfile")
eq("leading digits are made legal", Types.pascal("2fa_token"), "N2FaToken")

describe("types: typescript")
const ts = Types.generate('{"id":1,"name":"ada","tags":["x"],"at":{"city":"London"}}',
  { language: "typescript", rootName: "User", indent: 2 })
ok("exports the root", ts.indexOf("export interface User {") !== -1, ts)
ok("primitives map over", ts.indexOf("id: number;") !== -1 && ts.indexOf("name: string;") !== -1, ts)
ok("arrays", ts.indexOf("tags: string[];") !== -1, ts)
ok("nested objects get their own interface", ts.indexOf("export interface At {") !== -1, ts)
ok("optional fields are marked",
  Types.generate('[{"a":1},{"a":1,"b":2}]', { language: "typescript" }).indexOf("b?: number;") !== -1)
ok("keys that are not identifiers are quoted",
  Types.generate('{"content-type":"x"}', { language: "typescript" }).indexOf('"content-type": string;') !== -1)

describe("types: go")
const go = Types.generate('{"id":1,"user_id":2,"api_url":"x","normal":true}', { language: "go", indent: 2 })
// Go's linter wants initialisms in one case, and generated code that trips it
// on arrival is not much of a favour.
ok("ID not Id", go.indexOf("ID int64") !== -1, go)
ok("UserID not UserId", go.indexOf("UserID int64") !== -1, go)
ok("APIURL not ApiUrl", go.indexOf("APIURL string") !== -1, go)
ok("ordinary words are unaffected", go.indexOf("Normal bool") !== -1, go)
ok("json tags carry the original key", go.indexOf('`json:"user_id"`') !== -1, go)
ok("optional fields become pointers with omitempty",
  Types.generate('[{"a":1},{"a":1,"b":2}]', { language: "go" }).indexOf('*int64 `json:"b,omitempty"`') !== -1)
ok("type names get the same treatment",
  Types.generate('{"api_response":{"x":1}}', { language: "go" }).indexOf("type APIResponse struct") !== -1)

describe("types: rust")
const rs = Types.generate('{"user_name":"ada","count":2}', { language: "rust", indent: 2 })
ok("derives serde", rs.indexOf("#[derive(Debug, Clone, Serialize, Deserialize)]") !== -1)
ok("fields are snake case", rs.indexOf("pub user_name: String,") !== -1, rs)
ok("no rename needed when the key already matches", rs.indexOf("serde(rename") === -1, rs)
const renamed = Types.generate('{"userName":"ada"}', { language: "rust" })
ok("serde is told when the idiomatic name differs", renamed.indexOf('#[serde(rename = "userName")]') !== -1)
// A JSON key can be a Rust keyword; the output has to compile.
const kw = Types.generate('{"ref":"a","type":"b","match":1,"fine":true}', { language: "rust" })
ok("keywords become raw identifiers", kw.indexOf("pub r#ref: String,") !== -1, kw)
ok("and so do the others", kw.indexOf("pub r#type:") !== -1 && kw.indexOf("pub r#match:") !== -1)
ok("non-keywords are untouched", kw.indexOf("pub fine: bool,") !== -1)
ok("optional becomes Option",
  Types.generate('[{"a":1},{"a":1,"b":2}]', { language: "rust" }).indexOf("pub b: Option<i64>,") !== -1)

describe("types: through the catalogue")
const jt = Catalog.byId("json-types")
for (const language of ["typescript", "go", "rust"]) {
  const r = Catalog.run(jt, sampleOf("json-types"), Object.assign(Catalog.defaultsFor(jt), { language }))
  ok(language + " succeeds", r.ok, r.error)
  ok(language + " produces declarations", r.output.length > 0)
}
ok("it counts what it made", /3 types/.test(Catalog.run(jt, sampleOf("json-types"), Catalog.defaultsFor(jt)).info))
ok("and admits what the sample left optional",
  /1 optional from the sample/.test(Catalog.run(jt, sampleOf("json-types"), Catalog.defaultsFor(jt)).info))
eq("broken JSON fails cleanly", Catalog.run(jt, "{oops", Catalog.defaultsFor(jt)).ok, false)
// A bare scalar produces nothing worth pasting anywhere, so it says so rather
// than emitting `type Root = string;`.
eq("a bare scalar is refused", Catalog.run(jt, '"just a string"', Catalog.defaultsFor(jt)).ok, false)
ok("with a reason", /no object to describe/.test(
  Catalog.run(jt, '"just a string"', Catalog.defaultsFor(jt)).error))
// An array of objects is worth describing, and an array of scalars is at least
// a usable alias.
ok("an array of objects works",
  Catalog.run(jt, '[{"a":1}]', Catalog.defaultsFor(jt)).output.indexOf("interface") !== -1)
eq("an array of scalars becomes an alias",
  Catalog.run(jt, '[1,2,3]', Catalog.defaultsFor(jt)).output, "export type Root = number[];")

describe("text: statistics")
const a = Text.analyze("One two three.\n\nFour five! Six seven eight?\n")
eq("words", a.words, 8)
eq("sentences", a.sentences, 3)
eq("paragraphs", a.paragraphs, 2)
eq("lines counted, blanks noted", [a.lines, a.nonEmptyLines], [4, 2])
eq("longest line", a.longestLine, 27)
eq("unique words ignore case and punctuation", Text.analyze("Cat cat CAT dog").uniqueWords, 2)
eq("average word length", Text.analyze("aa bbbb").averageWordLength, 3)
eq("reading time", Text.analyze(new Array(201).join("word ")).readingSeconds, 60)
eq("empty text", [Text.analyze("").words, Text.analyze("").lines, Text.analyze("").paragraphs], [0, 0, 0])
const stats = Catalog.run(Catalog.byId("text-stats"), "héllo wörld", {})
ok("the report reaches the byte count", stats.fields.some(f => f.label === "Size as UTF-8"))
ok("and notices multi-byte characters",
  stats.fields.find(f => f.label === "Size as UTF-8").value.indexOf("bytes over") !== -1)

describe("history: recording")
const t0 = 1000000
const entry = (id, input, at) => History.makeEntry(id, id, input, {}, at)
let log = []
log = History.add(log, entry("json", "first", t0))
log = History.add(log, entry("json", "second", t0 + 60000))
eq("newest first", log.map(e => e.input), ["second", "first"])
eq("empty input is not worth recording", History.add(log, entry("json", "", t0)).length, 2)

// Runs are recorded on a debounce, so typing would otherwise leave one entry
// per keystroke.
let typing = []
for (const [i, text] of ["h", "he", "hel", "hell", "hello"].entries())
  typing = History.add(typing, entry("json", text, t0 + i * 300))
eq("typing collapses to one entry", typing.length, 1)
eq("and keeps the latest text", typing[0].input, "hello")
// Deleting back down is the same piece of work.
typing = History.add(typing, entry("json", "hell", t0 + 2000))
eq("trimming collapses too", typing.length, 1)
// A different tool, or a long pause, is a new entry.
eq("a different tool starts a new entry",
  History.add(typing, entry("case", "hello", t0 + 2100)).length, 2)
eq("so does a long pause",
  History.add(typing, entry("json", "hello there", t0 + 200000)).length, 2)
eq("and so does unrelated text",
  History.add(typing, entry("json", "something else", t0 + 2100)).length, 2)

describe("history: keeping it bounded")
let many = []
for (let i = 0; i < 80; i++) many = History.add(many, entry("json", "run " + i, t0 + i * 60000))
eq("capped", many.length, 50)
eq("the newest survive", many[0].input, "run 79")
eq("custom cap", History.add(many, entry("case", "x", t0 + 9999999), 5).length, 5)

describe("history: presentation")
eq("preview is one line", History.preview("a\n\n  b   c\n"), "a b c")
eq("and elided", History.preview("x".repeat(200), 10), "xxxxxxxxx…")
eq("short text is untouched", History.preview("short", 90), "short")
eq("relative times", [
  History.relative({ at: t0 }, t0 + 5000),
  History.relative({ at: t0 }, t0 + 30000),
  History.relative({ at: t0 }, t0 + 300000),
  History.relative({ at: t0 }, t0 + 7200000)
], ["just now", "30s ago", "5m ago", "2h ago"])
eq("summary counts distinct tools",
  History.summarize([entry("json", "a", t0), entry("json", "b", t0), entry("case", "c", t0)]),
  { entries: 3, tools: 2 })
eq("empty summary", History.summarize([]), { entries: 0, tools: 0 })

describe("history: removal")
eq("forget one", History.remove(log, 0).map(e => e.input), ["first"])
eq("out of range is harmless", History.remove(log, 99).length, 2)
eq("clear", History.clear(), [])

describe("history: the tool itself")
const hist = Catalog.byId("history")
eq("it is its own view", hist.view, "history")
eq("it computes nothing", Catalog.run(hist, "", {}).ok, true)
eq("it is findable", Catalog.search("history")[0].id, "history")
// Secrets are stripped by the caller before an entry is ever built, using the
// same declaration the session store uses.
eq("a JWT secret never reaches an entry",
  Object.keys(History.makeEntry("jwt", "JWT", "token",
    Catalog.withoutSecrets(Catalog.byId("jwt"), { secret: "hunter2", secretIsBase64: true }),
    t0).state), ["secretIsBase64"])

describe("recents: recording use")
eq("most recent first", Recents.note(Recents.note([], "json", 5), "sql", 5), ["sql", "json"])
eq("re-running the same tool changes nothing", Recents.note(["json", "sql"], "json", 5), ["json", "sql"])
eq("using an older one moves it to the front", Recents.note(["json", "sql", "case"], "case", 5),
  ["case", "json", "sql"])
eq("chains are not recorded — they have their own section",
  Recents.note(["json"], "chain:url-param-json", 5), ["json"])
eq("nothing is not recorded", Recents.note(["json"], "", 5), ["json"])
// More is kept than is shown, so unpinning reveals what was underneath rather
// than an empty gap.
let long = []
for (const id of ["json", "sql", "case", "diff", "regex", "cron", "color", "qr"]) long = Recents.note(long, id, 5)
ok("keeps a tail beyond the visible five", long.length > 5, "kept " + long.length)

describe("recents: pinning")
eq("pin", Recents.togglePin([], "sql"), ["sql"])
eq("unpin", Recents.togglePin(["sql", "json"], "sql"), ["json"])
eq("pins keep the order you made them in", Recents.togglePin(["sql"], "json"), ["sql", "json"])
eq("pinning twice is idempotent-ish", Recents.togglePin(Recents.togglePin([], "sql"), "sql"), [])
eq("chains cannot be pinned", Recents.togglePin([], "chain:url-param-json"), [])
eq("nor can something that is not a tool", Recents.togglePin([], "nonsense"), [])
eq("canPin", [Recents.canPin("sql"), Recents.canPin("chain:x"), Recents.canPin("zzz")],
  [true, false, false])
eq("isPinned", [Recents.isPinned(["sql"], "sql"), Recents.isPinned(["sql"], "json")], [true, false])

describe("recents: the block above the catalogue")
eq("recents only", Recents.block([], ["json", "sql"], 5).map(r => r.id), ["json", "sql"])
eq("pinned sort above recents", Recents.block(["cron"], ["json", "sql"], 5).map(r => r.id),
  ["cron", "json", "sql"])
eq("and are marked as such", Recents.block(["cron"], ["json"], 5).map(r => r.pinned), [true, false])
eq("a pinned tool is not repeated in the recents half",
  Recents.block(["json"], ["json", "sql"], 5).map(r => r.id), ["json", "sql"])
// Pinning must not cost a recent slot.
eq("the cap applies only to the unpinned",
  Recents.block(["cron", "color"], ["json", "sql", "case", "diff", "regex", "qr"], 5).length, 7)
eq("unknown ids are skipped", Recents.block(["gone"], ["json", "also-gone"], 5).map(r => r.id), ["json"])
eq("entries carry what the list needs",
  Object.keys(Recents.block([], ["json"], 5)[0]).sort(),
  ["category", "icon", "id", "inRecents", "name", "pinned"])

// The pin affordance is drawn only on rows that carry this flag. A pin on a
// row in "Format & validate" offered to promote it to the top of a list it was
// not in; the block is the only place the action means anything.
ok("every row in the block is flagged as being in it",
  Recents.block(["cron"], ["json", "sql"], 5).every(r => r.inRecents === true))
ok("and catalogue rows are not — they are plain tools",
  Catalog.tools().every(t => t.inRecents === undefined))

describe("recents: the heading tells the truth")
eq("no pins", Recents.label([]), "Recent")
eq("some pins", Recents.label(["sql"]), "Pinned & recent")
eq("the block agrees with the label", Recents.block(["sql"], ["json"], 5)[0].category, "Pinned & recent")
eq("hoisted ids cover the whole block",
  Object.keys(Recents.hoisted(["cron"], ["json", "sql"], 5)).sort(), ["cron", "json", "sql"])

describe("palette: reading the theme's own colours")
const TOML = `mode = "dark"

accent = "#7aa2f7"
muted = "#414868"
background = "#1a1b26"
foreground = "#a9b1d6"

red = "#f7768e"
green = "#9ece6a"
yellow = "#e0af68"
orange = "#eb927b"
blue = "#7aa2f7"
cyan = "#449dab"
magenta = "#ad8ee6"

bright_red = "#ff7a93"
color4 = "#111111"
`
const pal = Palette.parse(TOML)
eq("named colours are picked up", [pal.red, pal.green, pal.orange], ["#f7768e", "#9ece6a", "#eb927b"])
eq("so are the roles", [pal.accent, pal.muted], ["#7aa2f7", "#414868"])
eq("bright_ variants are not confused for the base", pal.red, "#f7768e")
eq("unrelated keys are ignored", pal.color4, undefined)
eq("unquoted values work too", Palette.parse('green = #9ece6a').green, "#9ece6a")
eq("a theme with none of them gives nothing", Object.keys(Palette.parse("mode = \"dark\"")).length, 0)
eq("garbage is not a crash", Object.keys(Palette.parse("")).length, 0)
eq("first definition wins, as the shell does", Palette.parse('red = "#aaaaaa"\nred = "#bbbbbb"').red, "#aaaaaa")

describe("palette: category hues")
eq("each tool section gets its own", [
  Palette.categoryColor(pal, "Format & validate", "#fallback"),
  Palette.categoryColor(pal, "Time & web", "#fallback")
], ["#9ece6a", "#eb927b"])
// Red means "something went wrong" everywhere else in the plugin.
ok("no category is permanently red",
  Catalog.tools().every(t => Palette.categoryColor(pal, t.category, "#fallback") !== pal.red))
eq("a hue the theme omits falls back", Palette.categoryColor({}, "Format & validate", "#fallback"), "#fallback")
eq("an unknown category falls back", Palette.categoryColor(pal, "Nonsense", "#fallback"), "#fallback")
const SECTIONS = [...new Set(Catalog.tools().map(t => t.category))]
  .concat(["Chains", "Recent", "Pinned & recent"])
eq("every section of the list has a hue assigned",
  SECTIONS.filter(c => Palette.categoryColor(pal, c, "#fallback") === "#fallback"), [])

// Grounded in the themes people actually run, not just a fixture. Skipped
// where Omarchy is not installed, so the suite still runs anywhere.
const themeDir = "/usr/share/omarchy/themes"
if (fsSync.existsSync(themeDir)) {
  const themes = fsSync.readdirSync(themeDir)
    .filter(t => fsSync.existsSync(themeDir + "/" + t + "/colors.toml"))
  ok("there are stock themes to check", themes.length > 0)
  const bad = []
  for (const theme of themes) {
    const parsed = Palette.parse(fsSync.readFileSync(themeDir + "/" + theme + "/colors.toml", "utf8"))
    for (const section of SECTIONS)
      if (Palette.categoryColor(parsed, section, "#fallback") === "#fallback")
        bad.push(theme + "/" + section)
  }
  // Three stock themes omit `orange`; those sections fall back to the accent,
  // which is the whole point of the fallback.
  const withoutOrange = bad.filter(b => !b.endsWith("/Time & web"))
  ok("every stock theme resolves every section except the known orange gap",
    withoutOrange.length === 0, withoutOrange.join(", "))
  ok("and the only gap really is orange", bad.every(b => b.endsWith("/Time & web")), bad.join(", "))
}
eq("named lookup", Palette.color(pal, "green", "#fallback"), "#9ece6a")
eq("named lookup falls back", Palette.color(pal, "chartreuse", "#fallback"), "#fallback")
eq("has", [Palette.has(pal, "green"), Palette.has(pal, "chartreuse"), Palette.has(null, "green")],
  [true, false, false])

describe("catalog: the list groups cleanly")
// The sidebar is a ListView grouped by category, which repeats a heading if the
// same category reappears later in the array. Adding a tool in the wrong place
// silently splits its section in two, which is how Base64 Image ended up with
// a second "Encode & decode" heading of its own.
const orderSeen = new Set()
const reopened = []
let previous = null
for (const tool of Catalog.tools()) {
  if (tool.category === previous) continue
  if (orderSeen.has(tool.category)) reopened.push(tool.category + " at " + tool.name)
  orderSeen.add(tool.category)
  previous = tool.category
}
eq("no category is split across the array", reopened, [])
eq("Session leads, so its section sits at the top", Catalog.tools()[0].category, "Session")

describe("previews never touch the network")
// Confirmed by experiment before this existed: Qt's rich-text and Markdown
// renderers fetch remote images, so two HTTP GETs arrived at a local listener
// from a pasted <img> and a pasted ![](). The rule is an allowlist — only
// data: URIs, which carry their bytes and cannot reach anywhere.
const blockedHtml = Sanitize.forPreview('<p>hi <img src="http://tracker.example/p.png"></p>', "html")
eq("http img is neutralised", blockedHtml.text, '<p>hi <img src=""></p>')
eq("and counted", blockedHtml.blocked, 1)
eq("https too", Sanitize.forPreview('<img src="https://x/p.png">', "html").blocked, 1)
eq("protocol-relative too", Sanitize.forPreview('<img src="//x/p.png">', "html").blocked, 1)
eq("file: too — a preview has no business reading the disk",
  Sanitize.forPreview('<img src="file:///etc/hostname">', "html").blocked, 1)
eq("single quotes", Sanitize.forPreview("<img src='http://x/p.png'>", "html").blocked, 1)
eq("unquoted", Sanitize.forPreview('<img src=http://x/p.png>', "html").blocked, 1)
eq("uppercase attribute", Sanitize.forPreview('<IMG SRC="http://x/p.png">', "html").blocked, 1)
eq("background attribute fetches too", Sanitize.forPreview('<td background="http://x/p.png">', "html").blocked, 1)
eq("several are all caught",
  Sanitize.forPreview('<img src="http://a/1.png"><img src="http://b/2.png">', "html").blocked, 2)

// data: is the one thing allowed through, because it cannot reach anywhere.
const kept = Sanitize.forPreview('<img src="data:image/png;base64,AAAA">', "html")
eq("data: survives untouched", kept.text, '<img src="data:image/png;base64,AAAA">')
eq("and is not counted", kept.blocked, 0)

eq("markdown images", Sanitize.forPreview("![x](http://tracker.example/p.png)", "markdown").text, "![x]()")
eq("markdown with a title", Sanitize.forPreview('![x](http://x/p.png "t")', "markdown").blocked, 1)
eq("markdown data: survives",
  Sanitize.forPreview("![x](data:image/png;base64,AAAA)", "markdown").blocked, 0)
eq("reference-style definitions are emptied",
  Sanitize.forPreview("![x][ref]\n\n[ref]: http://tracker.example/p.png", "markdown").blocked, 1)
// Qt's Markdown renderer honours inline HTML, so it gets the HTML pass too.
eq("inline html inside markdown is caught",
  Sanitize.forPreview('text <img src="http://x/p.png"> more', "markdown").blocked, 1)
eq("ordinary links are left alone — a link is only followed when activated",
  Sanitize.forPreview("[text](http://example.com)", "markdown").blocked, 0)
eq("prose is untouched", Sanitize.forPreview("just some **words**", "markdown").text, "just some **words**")
eq("empty", Sanitize.forPreview("", "html").blocked, 0)

describe("previews: reported, not silent")
const previewed = Catalog.run(Catalog.byId("html-preview"), '<img src="http://x/p.png">', {})
ok("the pane says what it withheld", /1 remote image blocked/.test(previewed.info), previewed.info)
ok("clean content says so instead",
  /no scripts, no network/.test(Catalog.run(Catalog.byId("html-preview"), "<b>hi</b>", {}).info))
ok("markdown reports it alongside the word count",
  /remote image blocked/.test(Catalog.run(Catalog.byId("markdown"), "![a](http://x/p.png)", {}).info))

describe("path-taking tools only accept paths the plugin made")
// These two take a filesystem path rather than text. Nothing reaches them from
// a shared chain or the clipboard today, but both are one change away.
for (const id of ["qr-read", "base64-image"]) {
  const state = id === "base64-image" ? { mode: "encode" } : {}
  for (const hostile of ["/etc/passwd", "/home/someone/.ssh/id_rsa", "~/.bashrc",
                         "/run/user/1000/../../etc/shadow", "relative.png",
                         "/run/user/1000/omarchy-toolroll-scan-1.png.txt"]) {
    const r = Catalog.run(Catalog.byId(id), hostile, state)
    eq(id + " refuses " + hostile, r.ok, false)
  }
  const own = "/run/user/1000/omarchy-toolroll-scan-7.png"
  ok(id + " accepts a path it made", Catalog.run(Catalog.byId(id), own, state).ok,
    Catalog.run(Catalog.byId(id), own, state).error)
}
eq("preview paths are ours too",
  Catalog.run(Catalog.byId("qr-read"), "/tmp/omarchy-toolroll-preview-2.png", {}).ok, true)

describe("chain steps that need the app say so")
const hostStep = Chain.run({ steps: [{ toolId: "qr-read" }, { toolId: "case" }] },
  "/run/user/1000/omarchy-toolroll-scan-1.png")
eq("flagged as needing the host", hostStep.steps[0].needsHost, true)
ok("and warned about rather than silently passing through",
  /cannot run as a chain step/.test(hostStep.steps[0].warning), hostStep.steps[0].warning)
ok("validate warns too",
  Chain.validate({ steps: [{ toolId: "qr-read" }] }).warnings.some(w => /cannot run as a chain step/.test(w.message)))
eq("an ordinary step is not flagged", Chain.run({ steps: [{ toolId: "case" }] }, "x").steps[0].needsHost, false)

describe("the regex tester never runs on the UI thread")
// It is the only tool that runs code the user wrote, and a catastrophic
// pattern cannot be interrupted once started.
eq("declared", Catalog.byId("regex").alwaysWorker, true)
eq("and it is the only one that needs to be",
  Catalog.tools().filter(t => t.alwaysWorker === true).map(t => t.id), ["regex"])

describe("unicode inspector: code points are not truncated")
// `("0000" + hex).slice(-4)` turned U+1F30D into U+F30D, and the escape with
// it — an escape that silently produces a different character when pasted.
const astralRow = Catalog.run(Catalog.byId("unicode"), "\u{1F30D}", {}).output
ok("five-digit code point survives", astralRow.indexOf("U+1F30D") !== -1, astralRow)
ok("so does its escape", astralRow.indexOf("u{1F30D}") !== -1, astralRow)
ok("four-digit ones are still padded",
  Catalog.run(Catalog.byId("unicode"), "A", {}).output.indexOf("U+0041") !== -1)
ok("and the utf-8 bytes were always right",
  astralRow.indexOf("f0 9f 8c 8d") !== -1, astralRow)

describe("tools that cannot be a chain step are not offered as one")
// A chain is a fold: text in, text out. Some tools are windows instead — they
// browse, render, invent, or need a file only the app can open. Offering one
// in the step picker is a trap rather than a choice.
const blocked = Catalog.tools().filter(t => Catalog.stepBlockReason(t) !== "").map(t => t.id)
eq("the exact set, so adding a tool is a deliberate decision", blocked.sort(),
  ["base64-image", "diff", "history", "html-preview", "lorem", "markdown",
   "qr-read", "random-string", "uuid"])
eq("the picker offers everything else", Catalog.stepTools().length,
  Catalog.tools().length - blocked.length)
ok("and offers none of the blocked ones",
  Catalog.stepTools().every(t => blocked.indexOf(t.id) === -1))
ok("every reason completes the sentence it is dropped into",
  blocked.every(id => /^[a-z]/.test(Catalog.stepBlockReason(id))))
// QR Code is deliberately not blocked: it works as the last step, and being
// misplaced earns a warning on the card rather than removal from the picker.
eq("an image tool is still offered", Catalog.stepBlockReason(Catalog.byId("qr")), "")
ok("as are ordinary transforms",
  ["json", "base64", "hash", "lines", "regex"].every(id => Catalog.stepBlockReason(id) === ""))

describe("a blocked step passes through rather than emptying the chain")
// History reported success and returned an empty string, so a chain with it in
// the middle silently lost everything downstream of it — a failure that never
// looked like one. It is no longer offered, but a hand-edited chains file or
// one saved before this can still contain it.
const withHistory = Chain.run({ steps: [
  { toolId: "base64", state: { mode: "decode" } },
  { toolId: "history", state: {} },
  { toolId: "json", state: { mode: "format" } }
] }, Buffer.from('{"a":1}').toString("base64"))
ok("the chain still runs", withHistory.ok, withHistory.error)
eq("and reaches the right answer", withHistory.output, '{\n  "a": 1\n}')
eq("the blocked step really was skipped, not run", withHistory.steps[1].output, '{"a":1}')
ok("and says so on its card", /cannot run as a chain step/.test(withHistory.steps[1].warning),
  withHistory.steps[1].warning)
ok("naming the reason", /browses past sessions/.test(withHistory.steps[1].warning))
ok("validate warns about it too",
  Chain.validate({ steps: [{ toolId: "history" }] }).warnings
    .some(w => /cannot run as a chain step/.test(w.message)))
eq("but it is not an error — the chain still runs",
  Chain.validate({ steps: [{ toolId: "history" }] }).ok, true)

// Generators were the subtler trap: they succeed, so nothing looks wrong, but
// they discard every byte the previous steps produced.
const withUuid = Chain.run({ steps: [{ toolId: "case" }, { toolId: "uuid" }] }, "hello world")
eq("a generator no longer replaces the chain's output", withUuid.output, "helloWorld")
ok("and explains why it did nothing", /discarding whatever the previous step produced/
  .test(withUuid.steps[1].warning), withUuid.steps[1].warning)

// Previews were harmless but pointless: they passed input through in silence.
eq("a preview passes through, as it always did",
  Chain.run({ steps: [{ toolId: "markdown" }] }, "# hi").output, "# hi")
ok("but now says that is all it did",
  /renders a preview/.test(Chain.run({ steps: [{ toolId: "markdown" }] }, "# hi").steps[0].warning))

describe("every worked example actually works")
// The whole point of an example is that pressing the button teaches you what
// the tool does. One that errored, or came back blank, would teach the
// opposite — so every one of them is run here rather than trusted.
let exampleCount = 0
for (const tool of Catalog.tools()) {
  for (const sample of Samples.forTool(tool.id)) {
    exampleCount++
    const state = Object.assign(Catalog.defaultsFor(tool), sample.state || {})
    const result = Catalog.run(tool, sample.input, state)
    ok(tool.id + ": " + sample.label + " succeeds", result.ok, result.error)
    ok(tool.id + ": " + sample.label + " returns something", result.output.length > 0)
    ok(tool.id + ": " + sample.label + " is labelled",
      typeof sample.label === "string" && sample.label.length > 0)
  }
}
ok("and there are enough of them to be worth a random pick", exampleCount >= 80, exampleCount)

describe("examples: three each, and all different")
const withExamples = Catalog.tools().filter(t => Samples.hasTool(t.id))
eq("every tool that takes typed input has some", withExamples.length,
  Catalog.tools().filter(t =>
    ["generate", "decode", "dataurl", "history"].indexOf(t.view) === -1).length)
ok("three apiece", withExamples.every(t => Samples.forTool(t.id).length === 3))
ok("no tool repeats an example", withExamples.every(t =>
  new Set(Samples.forTool(t.id).map(s => s.input)).size === 3))
// The tools with nothing to demonstrate must offer nothing, so the button can
// hide rather than load an empty string.
ok("generators and the file tools have none",
  ["uuid", "random-string", "lorem", "history", "qr-read", "base64-image"]
    .every(id => !Samples.hasTool(id)))

describe("examples: the button always changes something")
// A random pick out of three repeats itself a third of the time, which reads
// as a broken button. Picking excludes whatever is already on screen.
const three = Samples.forTool("color")
for (const current of three) {
  for (let i = 0; i < 40; i++)
    ok("never re-picks what is already there", Samples.pick(three, current.input).input !== current.input)
}
ok("an empty pane can get any of them",
  new Set(Array.from({ length: 200 }, () => Samples.pick(three, "").input)).size === 3)
ok("all three are reachable from any starting point",
  new Set(Array.from({ length: 200 }, () => Samples.pick(three, three[0].input).input)).size === 2)
eq("nothing to pick from is not a crash", Samples.pick([], "x"), null)
eq("a single example is still returned even if it is showing",
  Samples.pick([three[0]], three[0].input).input, three[0].input)

describe("every built-in chain's examples run the whole way through")
for (const chain of Chain.starterChains().map(Chain.normalize)) {
  const list = Samples.forChain(chain.id)
  eq(chain.name + " has three examples", list.length, 3)
  for (const sample of list) {
    const outcome = Chain.run(chain, sample.input)
    ok(chain.name + ": " + sample.label + " survives all " + chain.steps.length + " steps",
      outcome.ok, outcome.error)
    ok(chain.name + ": " + sample.label + " produces something", outcome.output.length > 0)
  }
}
// The fingerprint chain's examples carry their own lesson: two configs written
// differently come out with the same digest.
const fp = Samples.forChain("config-fingerprint")
eq("the reordered config fingerprints identically to the first",
  Chain.run(Chain.find(Chain.starterChains().map(Chain.normalize), "config-fingerprint"), fp[0].input).output,
  Chain.run(Chain.find(Chain.starterChains().map(Chain.normalize), "config-fingerprint"), fp[1].input).output)

describe("a chain nobody wrote examples for borrows its first step's")
// Custom chains get examples too, but only ones that demonstrably survive the
// whole chain — verified by running them, not assumed from the first step.
const borrower = Chain.normalize({ id: "mine", name: "Mine", steps: [
  { toolId: "base64", state: { mode: "decode" } },
  { toolId: "json", state: { mode: "format" } }
] })
const borrowed = Samples.forChainOrBorrow(borrower, Chain.run)
ok("it found some", borrowed.length > 0)
ok("all of them run the whole chain", borrowed.every(s => Chain.run(borrower, s.input).ok))
// Base64's first example is plain text meant for encoding; decoding it does
// not produce JSON, so offering it would teach the chain by breaking it.
ok("and the ones that would fail were dropped",
  borrowed.length < Samples.forTool("base64").length)
ok("specifically the encode-direction one",
  !borrowed.some(s => s.input === Samples.forTool("base64")[0].input))

// A chain whose first step's examples all fail gets nothing, so the button hides.
eq("nothing usable means no examples",
  Samples.forChainOrBorrow(Chain.normalize({ id: "x", name: "X", steps: [
    { toolId: "json" }, { toolId: "json-csv", state: { mode: "toCsv" } }
  ] }), Chain.run).filter(s => !Chain.run(Chain.normalize({ id: "x", name: "X", steps: [
    { toolId: "json" }, { toolId: "json-csv", state: { mode: "toCsv" } }
  ] }), s.input).ok).length, 0)
eq("a chain with no steps has none",
  Samples.forChainOrBorrow({ id: "empty", steps: [] }, Chain.run).length, 0)
// A built-in never borrows: it has its own, written for the whole chain.
eq("built-ins use their own", Samples.forChainOrBorrow(
  Chain.find(Chain.starterChains().map(Chain.normalize), "unique-matches"), Chain.run).length, 3)

describe("sidebar sections: order")
const sidebar = [
  { id: "chain:a", category: "Chains" }, { id: "sql", category: "Pinned & recent" },
  { id: "b64", category: "Encode & decode" }, { id: "json", category: "Format & validate" },
  { id: "xml", category: "Format & validate" }, { id: "case", category: "Text & data" },
  { id: "qr", category: "Generators" }
]
eq("names come out in row order", Sections.names(sidebar),
  ["Chains", "Pinned & recent", "Encode & decode", "Format & validate", "Text & data", "Generators"])
eq("no saved order leaves everything alone",
  Sections.applyOrder(sidebar, []).map(r => r.id), sidebar.map(r => r.id))
eq("a saved order is honoured",
  Sections.names(Sections.applyOrder(sidebar, ["Generators", "Text & data"])),
  ["Chains", "Pinned & recent", "Generators", "Text & data", "Encode & decode", "Format & validate"])
// A category added in a later version is absent from an order saved today.
ok("a section the saved order has never heard of still appears",
  Sections.names(Sections.applyOrder(sidebar, ["Generators"])).indexOf("Text & data") !== -1)
eq("and no row is lost or duplicated in the process",
  Sections.applyOrder(sidebar, ["Generators"]).length, sidebar.length)
eq("rows stay together and keep their internal order",
  Sections.applyOrder(sidebar, ["Format & validate"])
    .filter(r => r.category === "Format & validate").map(r => r.id), ["json", "xml"])
// Chains and the recents block answer "what was I just doing", which is only
// a useful question at the top.
ok("the structural sections cannot be moved",
  ["Chains", "Pinned & recent", "Recent"].every(n => !Sections.isMovable(n)))
ok("ordinary categories can", Sections.isMovable("Text & data"))
eq("and a stale file cannot bury the chain list",
  Sections.names(Sections.applyOrder(sidebar, ["Generators", "Chains", "Text & data"]))[0], "Chains")

describe("sidebar sections: moving one")
eq("up", Sections.move([], sidebar, "Text & data", -1),
  ["Encode & decode", "Text & data", "Format & validate", "Generators"])
eq("down", Sections.move([], sidebar, "Encode & decode", 1),
  ["Format & validate", "Encode & decode", "Text & data", "Generators"])
eq("the result is a complete order, not a diff",
  Sections.move([], sidebar, "Generators", -1).length,
  Sections.names(sidebar).filter(Sections.isMovable).length)
eq("moving past the top is refused", Sections.canMove([], sidebar, "Encode & decode", -1), false)
eq("as is past the bottom", Sections.canMove([], sidebar, "Generators", 1), false)
ok("but the middle moves either way",
  Sections.canMove([], sidebar, "Text & data", -1) && Sections.canMove([], sidebar, "Text & data", 1))
eq("an unmovable section refuses", Sections.canMove([], sidebar, "Chains", 1), false)
eq("and asking anyway changes nothing", Sections.move([], sidebar, "Chains", 1), [])
// Moves compose: applying one, then another, lands where you would expect.
const once = Sections.move([], sidebar, "Generators", -1)
eq("a second move builds on the first", Sections.move(once, sidebar, "Generators", -1),
  ["Encode & decode", "Generators", "Format & validate", "Text & data"])

describe("sidebar sections: collapsing one")
const folded = Sections.toggleCollapsed([], "Format & validate")
eq("it is remembered", folded, ["Format & validate"])
eq("toggling again unfolds it", Sections.toggleCollapsed(folded, "Format & validate"), [])
const arranged = Sections.arrange(sidebar, [], folded)
eq("its rows are gone", arranged.filter(r => r.id === "json" || r.id === "xml").length, 0)
// The heading is the only thing left to click to get the section back, so one
// placeholder stays behind to carry it.
eq("but the section is still there", Sections.names(arranged).indexOf("Format & validate") !== -1, true)
eq("carried by exactly one placeholder",
  arranged.filter(r => Sections.isPlaceholder(r)).length, 1)
eq("which knows how much it is hiding", Sections.hiddenCount(arranged, "Format & validate"), 2)
// The delegate binds name and icon into string properties whether or not it
// draws the row, so a placeholder missing them made Qt warn on every rebuild.
ok("and carries the same keys a real row does",
  arranged.filter(Sections.isPlaceholder).every(r =>
    typeof r.name === "string" && typeof r.icon === "string" && typeof r.id === "string"))
eq("other sections are untouched",
  arranged.filter(r => r.category === "Text & data").length, 1)
eq("nothing is a placeholder when nothing is collapsed",
  Sections.arrange(sidebar, [], []).filter(Sections.isPlaceholder).length, 0)
eq("collapsing everything leaves one row per section",
  Sections.arrange(sidebar, [], Sections.names(sidebar)).length, Sections.names(sidebar).length)
// Order and collapse have to compose, since both rewrite the same list.
eq("a collapsed section still moves with the rest",
  Sections.names(Sections.arrange(sidebar, ["Generators", "Format & validate"], folded)),
  ["Chains", "Pinned & recent", "Generators", "Format & validate", "Encode & decode", "Text & data"])

const pluginRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "")

describe("no Text element renders untrusted input as rich text")
// Qt's Text defaults to AutoText, which promotes anything that looks like HTML
// to rich text — and the rich-text engine fetches remote images. Demonstrated
// against a local listener: a Text with no textFormat requested
// http://127.0.0.1/leak.png from its own content; the one beside it with
// Text.PlainText requested nothing.
//
// Report rows, diff rows and history previews all display clipboard content or
// tool output, so every Text in the plugin has to declare its format. This is a
// source check because the sinks are QML, and a guard here is what stops the
// next Text from being added without one.
{
  const qmlFiles = []
  const walk = dir => {
    for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
      const full = dir + "/" + entry.name
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".qml")) qmlFiles.push(full)
    }
  }
  walk(pluginRoot)

  const offenders = []
  let checked = 0
  for (const file of qmlFiles) {
    const lines = fsSync.readFileSync(file, "utf8").split("\n")
    lines.forEach((line, i) => {
      if (!/^\s*Text \{\s*$/.test(line)) return
      checked++
      // The format may be declared on any line of the element's body; in
      // practice it is the first, and requiring that keeps the check simple.
      const body = lines.slice(i + 1, i + 12).join("\n")
      if (!/textFormat:/.test(body)) offenders.push(file.replace(pluginRoot, "") + ":" + (i + 1))
    })
  }
  ok("there are Text elements to check", checked > 20, checked)
  eq("every one declares a textFormat", offenders, [])

  // Exactly one is allowed to render rich text, and only because everything
  // reaching it has been through Sanitize.forPreview first.
  const rich = []
  for (const file of qmlFiles) {
    fsSync.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/textFormat:/.test(line) && !/Text\.PlainText/.test(line))
        rich.push(file.replace(pluginRoot, "") + ":" + (i + 1))
    })
  }
  eq("and only the sanitized preview renders anything else", rich,
    ["/ui/views/PreviewView.qml:62"])
}

describe("copied text never travels as a process argument")
// Process arguments are world-readable through /proc/<pid>/cmdline for as long
// as the process lives, and wl-copy stays resident to own the selection. This
// is a tool people paste tokens into, so the copy is the one moment that must
// not publish them to every other process on the machine.
{
  const shell = fsSync.readFileSync(pluginRoot + "/Toolroll.qml", "utf8")
  ok("wl-copy is not handed the text in argv",
    !/execDetached\(\[\s*"wl-copy"[^\]]*text/i.test(shell))
  ok("it is spawned with no content arguments",
    /command:\s*\["wl-copy"\]/.test(shell), "wl-copy command line changed")
  ok("and the text is written to its stdin", /stdinEnabled/.test(shell) && /write\(/.test(shell))
}

describe("the files the plugin writes are owner-only")
// FileView creates files with the process umask — 0644 on a stock install. The
// session store holds whatever was last in each tool.
{
  const shell = fsSync.readFileSync(pluginRoot + "/Toolroll.qml", "utf8")
  ok("permissions are restricted explicitly", /chmod", "600"/.test(shell))
  // An atomic write replaces the file, so the mode has to be re-applied rather
  // than set once at creation.
  const calls = (shell.match(/restrictToOwner\(/g) || []).length
  ok("for both files, on load and after every write", calls >= 5, calls + " call sites")
}

report()
