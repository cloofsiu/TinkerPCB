var fs = require("fs");
var path = require("path");
var PCB = require("./pcb-engine.js");

function run(id) {
  var doc = PCB.template(id);
  PCB.route(doc);
  var report = PCB.check(doc);
  var drills = 0;
  doc.parts.forEach(function (p) { drills += PCB.worldPads(p).length; });
  var vias = 0;
  doc.routes.forEach(function (r) { vias += (r.vias || []).length; });
  console.log(id, "parts", doc.parts.length, "nets", doc.nets.length, "routes", doc.routes.length, "vias", vias, "pads", drills, "errors", report.errors.length);
  if (report.errors.length) {
    console.log(JSON.stringify(report.errors, null, 2));
    console.log("unrouted", JSON.stringify(doc.unrouted));
  }
  return { doc: doc, report: report };
}

var led = run("led");
var hdr = run("header");
var ubit = run("ubit");
var uno = run("uno");
if (!led.report.ok || !hdr.report.ok || !ubit.report.ok || !uno.report.ok) process.exit(1);

var zip = PCB.exportZip(led.doc);
var out = path.join(__dirname, "sample-led-jlc.zip");
fs.writeFileSync(out, Buffer.from(zip));
console.log("zip", zip.length, out);

var blank = PCB.blank("測試");
var a = PCB.addPart(blank, "led", 20, 20);
var b = PCB.addPart(blank, "res", 40, 20);
PCB.connect(blank, a.uid, "A", b.uid, "1");
PCB.route(blank);
var c = PCB.check(blank);
if (!c.ok) {
  console.log("manual", JSON.stringify(c.errors));
  process.exit(1);
}
console.log("manual ok");

var dirty = {
  name: "爛", w: 999, h: "abc", mask: "pink", outline: "weird",
  parts: [
    null,
    { uid: "p1", type: "ghost-xyz", x: 1, y: 1 },
    { uid: "p2", type: "led", x: 20, y: 20, rot: 137, ref: "D9" },
    { uid: "p3", type: "res", x: 40, y: 20, ref: "R9" }
  ],
  nets: [
    { id: "n1", pins: [{ uid: "p1", pad: "A" }, { uid: "p2", pad: "A" }, { uid: "nope", pad: "ZZ" }] },
    { id: "n2", pins: [{ uid: "p2", pad: "K" }, { uid: "p3", pad: "1" }] },
    { id: "n3", pins: [{ uid: "p3", pad: "2" }, { uid: "p2", pad: "K" }] }
  ]
};
var clean = PCB.sanitize(dirty);
if (!clean) { console.log("sanitize dropped everything (unexpected)"); process.exit(1); }
console.log("sanitize:", clean.w, clean.h, clean.mask, clean.outline, "parts", clean.parts.length, "nets", clean.nets.length, "rot", clean.parts[0].rot);
if (clean.w !== 100 || clean.mask !== "green" || clean.outline !== "rect") process.exit(1); /* 999 clamped */
if (clean.parts.length !== 2) process.exit(1); /* ghost dropped */
if (clean.nets.length !== 2) process.exit(1); /* n1 dropped (ghost pin), n3 merged dup? n2+n3 both valid = 2 */
if (clean.parts[0].rot !== 0) process.exit(1);
PCB.route(clean);
var cc = PCB.check(clean);
if (!cc.ok) { console.log("clean check", JSON.stringify(cc.errors)); process.exit(1); }
console.log("sanitize ok");
var nothing = PCB.sanitize({ parts: [{ uid: "p1", type: "ghost", x: 1, y: 1 }], nets: [] });
if (nothing !== null) { console.log("expected null"); process.exit(1); }
console.log("all tests pass");
