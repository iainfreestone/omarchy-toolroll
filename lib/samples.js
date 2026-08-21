.pragma library

// Worked examples: three per tool, one press apart.
//
// The hardest moment in a tool like this is the empty input pane. "Number
// Base" tells you nothing about whether it wants 0xFF or 255 or 11111111, and
// "JSON → Types" gives no hint that the answer comes out as TypeScript. An
// example answers both halves at once — what goes in, and what comes back —
// far faster than any description can.
//
// Three rather than one because a single example reads as *the* input rather
// than *an* input. Three, picked at random, show the shape of what the tool
// accepts: that Base64 goes both ways, that Colour takes hex and rgb() and
// hsl(), that Unicode Inspector is the thing to reach for when a string has
// something invisible in it. Each carries its own options, so the example
// arrives configured the way it needs to be.
//
// Every one of these is checked by the test suite: it runs all of them and
// asserts each succeeds and returns something non-empty. An example that
// silently stopped working would be worse than no example at all.
//
// Tools absent from this table have nothing to demonstrate: the three
// generators ignore their input, History browses past sessions, and the two
// image tools need a real file rather than text. The button hides itself for
// those rather than loading something meaningless.

var TOOL_SAMPLES = {

  // ------------------------------------------------------ encode & decode
  "base64": [
    { label: "plain text to encode",
      input: "Never send a human to do a machine's job." },
    { label: "base64 hiding a JSON payload",
      input: "eyJ1c2VyIjoiYWRhIiwiYWRtaW4iOnRydWV9",
      state: { mode: "decode" } },
    { label: "base64 that decodes to non-ASCII",
      input: "SGVsbG8sIOS4lueVjCEg8J+MjQ==",
      state: { mode: "decode" } }
  ],

  "url-encode": [
    { label: "a URL with spaces in the query",
      input: "https://example.com/search?q=hello world&lang=en#top" },
    { label: "a percent-encoded URL to read",
      input: "https%3A%2F%2Fapi.example.com%2Fv2%2Fusers%3Ffilter%3Dname%20eq%20%27ada%27",
      state: { mode: "decode" } },
    { label: "a form body, where + means space",
      input: "name=Ada+Lovelace&note=100%25+done&tag=a%2Fb",
      state: { mode: "decode", plusAsSpace: true } }
  ],

  "html-entities": [
    { label: "markup with accents and symbols",
      input: "<p class=\"intro\">Café & crème — 5 > 3</p>" },
    { label: "an escaped payload out of a log",
      input: "&lt;script&gt;alert(&#39;hi&#39;)&lt;/script&gt;",
      state: { mode: "decode" } },
    { label: "named and numeric entities together",
      input: "&copy; 2026 &mdash; caf&eacute; &#8212; 5 &gt; 3",
      state: { mode: "decode" } }
  ],

  "escape": [
    { label: "text with newlines and tabs",
      input: "line one\nline two\ttabbed \"quoted\"" },
    { label: "an escaped string copied out of source",
      input: "C:\\\\Users\\\\ada\\\\notes.txt\\nsecond line",
      state: { mode: "unescape" } },
    { label: "a JSON string that needs escaping again",
      input: "{\"path\":\"/tmp/a b\",\"quote\":\"she said \"hi\"\"}" }
  ],

  "jwt": [
    { label: "the classic example token",
      input: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" },
    { label: "a token whose signature checks out against its secret",
      input: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfOSIsIm5hbWUiOiJBZGEgTG92ZWxhY2UiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NzAwMDAwMDB9.d3UrhJK6nKlriQ8urTQIiHe7iPI8G2oHDkuv24VQkjw",
      state: { secret: "your-256-bit-secret" } },
    { label: "a token that expired in 2018",
      input: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZGEiLCJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJhdWQiOiJhcGkiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjI0MjYyMn0.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ" }
  ],

  "hash": [
    { label: "the standard test vector",
      input: "The quick brown fox jumps over the lazy dog" },
    { label: "signing a webhook body with a key",
      input: "{\"event\":\"payment.succeeded\",\"amount\":4200}",
      state: { hmacKey: "whsec_test_secret" } },
    { label: "a digest to paste into a checksum file",
      input: "omarchy-2.0.0-x86_64.iso",
      state: { uppercase: true } }
  ],

  "base-convert": [
    { label: "a decimal number to see in hex",
      input: "3735928559" },
    { label: "hex, the way it appears in a colour or a mask",
      input: "0xFF7F50" },
    { label: "a permission bitmask in binary",
      input: "0b111101101" }
  ],

  "unicode": [
    { label: "accents and an emoji",
      input: "Héllo 🌍!" },
    { label: "a string with something invisible in it",
      input: "hello\u200Bworld — that gap is a zero-width space" },
    { label: "two cafés that are not the same bytes",
      input: "café vs cafe\u0301" }
  ],

  // ----------------------------------------------------- format & validate
  "json": [
    { label: "a minified object to pretty-print",
      input: "{\"name\":\"omarchy\",\"tags\":[\"linux\",\"wayland\"],\"meta\":{\"stars\":10000,\"fork\":false}}" },
    { label: "a formatted document to minify",
      input: "{\n  \"id\": 42,\n  \"items\": [\n    { \"sku\": \"A-1\", \"qty\": 2 },\n    { \"sku\": \"B-7\", \"qty\": 1 }\n  ]\n}",
      state: { mode: "minify" } },
    { label: "JSON with comments and a trailing comma",
      input: "{\n  // the port the server listens on\n  \"port\": 8443,\n  \"hosts\": [\"a.example.com\", \"b.example.com\",],\n}",
      state: { lenient: true } }
  ],

  "json-yaml": [
    { label: "JSON on its way to a config file",
      input: "{\"service\":\"web\",\"ports\":[80,443],\"env\":{\"RAILS_ENV\":\"production\"}}" },
    { label: "a compose file to read as JSON",
      input: "version: \"3.9\"\nservices:\n  web:\n    image: nginx:alpine\n    ports:\n      - \"8080:80\"\n    environment:\n      TZ: Europe/London",
      state: { mode: "toJson" } },
    { label: "a CI workflow, flattened",
      input: "name: test\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4",
      state: { mode: "toJson" } }
  ],

  "json-csv": [
    { label: "a CSV export to turn into JSON",
      input: "name,role,commits\nDHH,creator,4210\nada,maintainer,318" },
    { label: "records on their way to a spreadsheet",
      input: "[{\"sku\":\"A-1\",\"qty\":2,\"price\":9.99},{\"sku\":\"B-7\",\"qty\":1,\"price\":24.5}]",
      state: { mode: "toCsv" } },
    { label: "a semicolon export, lined up as a table",
      input: "id;city;population\n1;London;8982000\n2;Manchester;553230\n3;Bristol;467099",
      state: { mode: "table" } }
  ],

  "xml": [
    { label: "a minified document to lay out",
      input: "<?xml version=\"1.0\"?><catalog><book id=\"1\"><title>Dune</title><year>1965</year></book></catalog>" },
    { label: "an RSS item",
      input: "<rss version=\"2.0\"><channel><title>Omarchy</title><item><title>2.0 released</title><pubDate>Tue, 04 Feb 2026 09:00:00 GMT</pubDate></item></channel></rss>" },
    { label: "a formatted file to compact",
      input: "<config>\n  <server host=\"localhost\" port=\"8443\">\n    <tls enabled=\"true\"/>\n  </server>\n</config>",
      state: { mode: "minify" } }
  ],

  "html": [
    { label: "a fragment to lay out",
      input: "<div class=\"card\"><h2>Title</h2><p>Some <strong>bold</strong> text.</p><ul><li>one</li><li>two</li></ul></div>" },
    { label: "a form, indented",
      input: "<form action=\"/subscribe\" method=\"post\"><label for=\"email\">Email</label><input id=\"email\" type=\"email\" required><button type=\"submit\">Sign up</button></form>" },
    { label: "laid-out markup to compact for shipping",
      input: "<section>\n  <h1>Release notes</h1>\n  <p>Now with <em>plugins</em>.</p>\n</section>",
      state: { mode: "minify" } }
  ],

  "css": [
    { label: "a minified rule to lay out",
      input: "@media (min-width:600px){.card,.panel{display:flex;gap:8px;color:#fff}}" },
    { label: "custom properties and a theme block",
      input: ":root{--accent:#1e90ff;--radius:8px}.button{background:var(--accent);border-radius:var(--radius);padding:8px 16px}" },
    { label: "a stylesheet to compact for shipping",
      input: ".card {\n  display: grid;\n  gap: 12px;\n  padding: 16px;\n}\n\n.card h2 {\n  font-size: 18px;\n}",
      state: { mode: "minify" } }
  ],

  "sql": [
    { label: "a join to lay out",
      input: "select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = true group by u.id, u.name having count(o.id) > 5 order by orders desc limit 10;" },
    { label: "a query with a subquery and a CTE",
      input: "with recent as (select user_id, max(created_at) as last_seen from events where created_at > now() - interval '30 days' group by user_id) select u.email, r.last_seen from users u join recent r on r.user_id = u.id order by r.last_seen desc" },
    { label: "a laid-out statement to put on one line",
      input: "insert into audit_log (actor, action, target)\nvalues ('ada', 'delete', 'project:42')\nreturning id, created_at",
      state: { mode: "minify" } }
  ],

  "json-types": [
    { label: "a payload to type in TypeScript",
      input: "{\"id\":1,\"name\":\"ada\",\"tags\":[\"admin\",\"dev\"],\"address\":{\"city\":\"London\",\"postcode\":\"E1\"},\"orders\":[{\"ref\":\"A1\",\"total\":9.99},{\"ref\":\"A2\",\"total\":5,\"express\":true}]}" },
    { label: "an API response as a Go struct",
      input: "{\"id\":\"usr_9\",\"apiUrl\":\"https://api.example.com\",\"createdAt\":\"2026-02-04T09:00:00Z\",\"limits\":{\"rps\":50,\"burst\":100}}",
      state: { language: "go" } },
    { label: "a config as Rust structs",
      input: "{\"name\":\"web\",\"replicas\":3,\"ref\":\"main\",\"env\":{\"TZ\":\"UTC\"},\"ports\":[80,443]}",
      state: { language: "rust" } }
  ],

  // ------------------------------------------------------------ text & data
  "case": [
    { label: "words to convert every which way",
      input: "omarchy shell plugin" },
    { label: "a database column name",
      input: "user_id_number" },
    { label: "an acronym-heavy identifier",
      input: "parseHTTPResponseCode" }
  ],

  "text-stats": [
    { label: "two pangrams",
      input: "The quick brown fox jumps over the lazy dog.\n\nPack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!" },
    { label: "a paragraph to check against a length limit",
      input: "Omarchy is an opinionated Arch setup built around Hyprland. It ships a shell, a theme system, and a plugin format, so the desktop you get on day one is the desktop you keep. Everything here runs locally: no accounts, no sync, no telemetry." },
    { label: "a commit message, to check the subject line",
      input: "Fix the chain picker opening off-screen\n\nThe dropdown only ever opens downwards, so as the last row in the\ncolumn its options fell below the bottom edge of the window." }
  ],

  "lines": [
    { label: "a list to sort",
      input: "banana\napple\nCherry\napple\ndate\nbanana" },
    { label: "IDs pulled out of a log, with repeats",
      input: "usr_1043\nusr_2291\nusr_1043\nusr_8800\nusr_2291\nusr_1043",
      state: { mode: "dedupe" } },
    { label: "a pasted list with ragged whitespace",
      input: "  alpha  \n\n\tbeta\n  gamma\n\n   delta   ",
      state: { mode: "trim", ignoreBlank: true } }
  ],

  "diff": [
    { label: "two versions of a sentence",
      input: "the quick brown fox\njumps over\nthe lazy dog",
      state: { right: "the quick red fox\njumps over\nthe lazy dog\nand naps" } },
    { label: "a config before and after an edit",
      input: "host: localhost\nport: 8080\ntls: false\nworkers: 4",
      state: { right: "host: 0.0.0.0\nport: 8443\ntls: true\nworkers: 4" } },
    { label: "the same JSON with a field renamed",
      input: "{\n  \"id\": 42,\n  \"userName\": \"ada\",\n  \"active\": true\n}",
      state: { right: "{\n  \"id\": 42,\n  \"user_name\": \"ada\",\n  \"active\": true\n}" } }
  ],

  "regex": [
    { label: "finding email addresses",
      input: "Contact ada@example.com or grace@navy.mil before Friday.",
      state: { pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.]+" } },
    { label: "pulling fields out of log lines",
      input: "2026-02-04 09:15:22 ERROR db timeout after 3000ms\n2026-02-04 09:15:24 WARN  cache miss rate 12%\n2026-02-04 09:16:01 ERROR db timeout after 5000ms",
      state: { pattern: "^(\\S+ \\S+) (ERROR|WARN)\\s+(.*)$", multiline: true } },
    { label: "matching semantic version numbers",
      input: "omarchy 2.14.0, quickshell 0.9.1-beta, hyprland 0.45.2",
      state: { pattern: "(\\d+)\\.(\\d+)\\.(\\d+)(?:-([\\w.]+))?" } }
  ],

  "markdown": [
    { label: "a short README",
      input: "# Toolroll\n\nA **local** toolbox for the Omarchy shell.\n\n- No network\n- No telemetry\n- Just `functions`\n\n> Everything runs inside omarchy-shell.\n\n1. Copy something\n2. Press Super+Ctrl+U\n3. Get on with it" },
    { label: "a table and a fenced code block",
      input: "## Chains\n\n| Starter | Steps |\n| --- | --- |\n| URL param | 3 |\n| Fingerprint | 3 |\n\n```bash\nomarchy-shell shell toggle iain.toolroll\n```" },
    { label: "a checklist with nested items",
      input: "### Before release\n\n- [x] Tests green\n- [x] README current\n- [ ] Tag the version\n  - [ ] Sign it\n  - [ ] Push\n\n---\n\nSee [the docs](https://omarchy.org) for more." }
  ],

  "html-preview": [
    { label: "release notes",
      input: "<h2>Release notes</h2><p>Now with <b>plugins</b> and <i>panels</i>.</p><ul><li>Faster</li><li>Smaller</li></ul>" },
    { label: "a table of results",
      input: "<h3>Benchmarks</h3><table border=\"1\" cellpadding=\"6\"><tr><th>Case</th><th>Before</th><th>After</th></tr><tr><td>Cold start</td><td>820ms</td><td>310ms</td></tr><tr><td>Redraw</td><td>16ms</td><td>4ms</td></tr></table>" },
    { label: "an email that wants to phone home",
      input: "<h3>Your receipt</h3><p>Thanks for your order.</p><img src=\"http://tracker.example.com/open.gif?id=42\"><p>Total: <b>&pound;24.50</b></p>" }
  ],

  // -------------------------------------------------------------- time & web
  "unixtime": [
    { label: "seconds since the epoch",
      input: "1700000000" },
    { label: "the same instant in milliseconds",
      input: "1700000000000" },
    { label: "an ISO timestamp to turn back into a number",
      input: "2026-02-04T09:00:00Z" }
  ],

  "cron": [
    { label: "every quarter hour, office hours only",
      input: "*/15 9-17 * * 1-5" },
    { label: "a nightly backup",
      input: "30 3 * * *" },
    { label: "the first of the month",
      input: "0 0 1 * *" }
  ],

  "url-parse": [
    { label: "a URL with everything in it",
      input: "https://api.example.com:8443/v2/users/42?fields=id,name&include=orders&q=hello%20world#profile" },
    { label: "a callback URL carrying an OAuth code",
      input: "https://app.example.com/auth/callback?code=4%2F0AY0e-g7&state=eyJyZXR1cm4iOiIvZGFzaGJvYXJkIn0%3D&scope=email+profile" },
    { label: "a database connection string",
      input: "postgres://ada:hunter2@db.internal:5432/appdb?sslmode=require&pool=20" }
  ],

  "color": [
    { label: "hex, as it appears in CSS",
      input: "#1e90ff" },
    { label: "an rgb() value",
      input: "rgb(255, 99, 71)" },
    { label: "hsl(), with transparency",
      input: "hsla(210, 100%, 56%, 0.8)" }
  ],

  // ------------------------------------------------------------- generators
  "qr": [
    { label: "a link to put on screen",
      input: "https://omarchy.org" },
    { label: "wifi credentials a phone can join from",
      input: "WIFI:T:WPA;S:Omarchy Guest;P:correct-horse-battery;;" },
    { label: "a contact card",
      input: "BEGIN:VCARD\nVERSION:3.0\nN:Freestone;Iain\nEMAIL:hello@example.com\nURL:https://omarchy.org\nEND:VCARD" }
  ],

  "id-inspect": [
    { label: "a UUIDv7, which carries its timestamp",
      input: "018c1b9e-5f00-7000-8000-000000000000" },
    { label: "a random UUIDv4, which carries nothing",
      input: "9f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f" },
    { label: "a ULID",
      input: "01HQ8P5ZJ0X4M9K2T7VB3RCDEF" }
  ]
}

// ------------------------------------------------------------------ chains

// The built-in chains get worked examples too, because a chain is exactly the
// case where an empty input pane is most confusing: three steps deep, it is
// not obvious what the first one is expecting. A chain a user built themselves
// has no examples here, so its button borrows the ones belonging to its first
// step and keeps only those that survive the whole chain — see chainSamples().
var CHAIN_SAMPLES = {
  "url-param-json": [
    { label: "an OAuth state parameter",
      input: "eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iXX0%3D" },
    { label: "a signed redirect's payload",
      input: "eyJyZXR1cm4iOiIvZGFzaGJvYXJkIiwibm9uY2UiOiJhOTNmIn0%3D" },
    { label: "a ?data= blob out of a callback URL",
      input: "eyJvcmRlciI6eyJpZCI6NDIsInRvdGFsIjoyNDUwfSwiY3VycmVuY3kiOiJHQlAifQ%3D%3D" }
  ],
  "config-fingerprint": [
    { label: "a small service config",
      input: "name: web\nreplicas: 3\nenv:\n  TZ: UTC" },
    { label: "the same config, reordered and requoted",
      input: "env:\n  TZ: \"UTC\"\n\nreplicas: 3\nname: web" },
    { label: "a compose service",
      input: "image: nginx:alpine\nports:\n  - \"8080:80\"\nrestart: unless-stopped" }
  ],
  "unique-matches": [
    { label: "addresses scattered through a thread",
      input: "from zoe@corp.com to ada@corp.com\ncc: bob@x.io, zoe@corp.com\nada@corp.com replied" },
    { label: "a mailing list with duplicates",
      input: "ada@example.com\nbob@example.com\nada@example.com\ncarol@example.org\nbob@example.com" },
    { label: "addresses buried in log lines",
      input: "2026-02-04 09:15 login ok user=ada@corp.com\n2026-02-04 09:16 login fail user=mallory@evil.test\n2026-02-04 09:17 login ok user=ada@corp.com" }
  ]
}

// ------------------------------------------------------------------- lookup

function forTool(toolId) {
  var found = TOOL_SAMPLES[String(toolId)]
  return found ? found.slice(0) : []
}

function forChain(chainId) {
  var found = CHAIN_SAMPLES[String(chainId)]
  return found ? found.slice(0) : []
}

function hasTool(toolId) { return forTool(toolId).length > 0 }

// Examples for a chain, including one the user built themselves.
//
// A custom chain has no examples written for it, so it borrows its first
// step's and keeps only those that survive the whole chain — checked by
// running them, not assumed. A chain of base64-decode then JSON has no use for
// the example that shows base64 *encoding*: it would fail at step one and
// teach the chain by breaking it. If none survive, the caller gets an empty
// list and hides the button, which is the honest outcome.
//
// `run` is passed in rather than imported so this file stays pure data plus
// lookup, with no opinion about how a chain executes.
function forChainOrBorrow(chain, run) {
  var own = forChain(chain && chain.id ? chain.id : "")
  if (own.length > 0) return own
  if (!chain || !chain.steps || chain.steps.length === 0) return []
  var borrowed = forTool(chain.steps[0].toolId)
  var usable = []
  for (var i = 0; i < borrowed.length; i++) {
    var outcome = run(chain, borrowed[i].input)
    if (outcome && outcome.ok && String(outcome.output).length > 0) usable.push(borrowed[i])
  }
  return usable
}


// Pick one the user is not already looking at, so pressing the button always
// changes something. With three to choose from that is a real constraint, not
// a nicety: a random pick out of three repeats itself a third of the time.
function pick(list, currentInput) {
  if (!list || list.length === 0) return null
  var current = String(currentInput === undefined || currentInput === null ? "" : currentInput)
  var candidates = []
  for (var i = 0; i < list.length; i++)
    if (list[i].input !== current) candidates.push(list[i])
  if (candidates.length === 0) candidates = list
  return candidates[Math.floor(Math.random() * candidates.length)]
}
