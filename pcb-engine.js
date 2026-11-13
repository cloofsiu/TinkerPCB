/* PCB Studio engine. Browser + Node.
   Rules aimed at JLCPCB standard process, hand-solder THT:
   trace 0.30mm, clearance 0.20mm, via drill 0.6 / pad 1.1, mask +0.05mm/side.
   Not a KiCad replacement: no pour, no schematic sheet, no fab ordering. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PCBEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CELL = 0.5;
  var TRACE = 0.3;
  var CLEAR = 0.2;
  var VIA_DRILL = 0.6;
  var VIA_PAD = 1.1;
  var MASK = 0.05;
  var EDGE_KEEP = 0.4;

  function r2(n) { return Math.round(n * 100) / 100; }
  function snap(n) { return r2(Math.round(n / 1.27) * 1.27); }
  function rot90(x, y, k) {
    k = ((k % 4) + 4) % 4;
    if (k === 1) return [-y, x];
    if (k === 2) return [-x, -y];
    if (k === 3) return [y, -x];
    return [x, y];
  }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pad(id, x, y, drill, dia, group, label) {
    return { id: id, x: x, y: y, drill: drill, dia: dia, group: group || id, label: label || group || id };
  }

  /* BBC micro:bit 80-pin THT Edge Connector Socket (Kitronik 5604 / 4UCON 17809).
     Housing: 56.89 x 8.88 x 14.0mm with central card slot and 2 locating posts
     at x = +-26.035mm. The 21 active micro:bit V2 signals (5 main rings: P0, P1,
     P2, 3V, GND + 16 GPIO strips) are broken out on 2 staggered THT rows
     (y = -1.90mm and y = +1.90mm, minimum 2.54mm same-row pitch, 4.01mm diagonal)
     so every signal is a distinct hand-solderable THT pad and the micro:bit plugs
     upright into the socket. */
  var UBIT_PINS = [
    ["P3", -24.13, -1.9, 0],
    ["P0", -21.59, 1.9, 1],
    ["P4", -19.05, -1.9, 0],
    ["P5", -16.51, 1.9, 0],
    ["P6", -13.97, -1.9, 0],
    ["P7", -11.43, 1.9, 0],
    ["P1", -8.89, -1.9, 1],
    ["P8", -6.35, 1.9, 0],
    ["P9", -3.81, -1.9, 0],
    ["P10", -1.27, 1.9, 0],
    ["P11", 1.27, -1.9, 0],
    ["P12", 3.81, 1.9, 0],
    ["P2", 6.35, -1.9, 1],
    ["P13", 8.89, 1.9, 0],
    ["P14", 11.43, -1.9, 0],
    ["P15", 13.97, 1.9, 0],
    ["P16", 16.51, -1.9, 0],
    ["3V", 19.05, 1.9, 1],
    ["P19", 20.32, -1.9, 0],
    ["P20", 22.86, 1.9, 0],
    ["GND", 24.13, -1.9, 1]
  ];

  function ubitPads() {
    var pads = UBIT_PINS.map(function (p) {
      var ring = p[3] === 1;
      return {
        id: p[0],
        x: p[1],
        y: p[2],
        drill: 0.9,
        dia: ring ? 1.85 : 1.55,
        ring: ring,
        group: p[0],
        label: p[0]
      };
    });
    pads.push({ id: "M1", x: -26.04, y: 0, drill: 2.0, dia: 3.2, group: "H", label: "M1", mechanical: true });
    pads.push({ id: "M2", x: 26.04, y: 0, drill: 2.0, dia: 3.2, group: "H", label: "M2", mechanical: true });
    return pads;
  }


  /* Arduino UNO R3 shield socket. Coordinates from the verified KiCad
     footprint Arduino_Uno_R3_Shield (Alarm-Siren/arduino-kicad-library,
     sourced from docs.arduino.cc). Origin = UNO's bottom-left corner,
     local y up. Bottom row (y=2.54): POWER 8 pins + gap at 48.26 +
     ANALOG 6 pins. Top row (y=50.8): DIGITAL 10-pin (SCL..D8) + gap at
     43.18 + 8-pin (D7..D0). ICSP 2x3 off-grid by design (63.627/66.167).
     Mounting holes 3.2mm at 4 official positions. */
  function unoPads() {
    var pads = [];
    function add(id, x, y, group, label) {
      pads.push({ id: id, x: x, y: y, drill: 1.016, dia: 1.7272, group: group, label: label || id });
    }
    var power = [
      ["NC1", 27.94, "NC"],
      ["IOREF", 30.48, "IOREF"],
      ["RESET", 33.02, "RESET"],
      ["3V3", 35.56, "3V3"],
      ["5V", 38.1, "5V"],
      ["GND", 40.64, "GND"],
      ["GND", 43.18, "GND"],
      ["VIN", 45.72, "VIN"]
    ];
    power.forEach(function (p, i) {
      add("P" + (i + 1), p[1], 2.54, p[2], p[2] === "NC" ? "NC" : p[2]);
    });
    var ana = [["A0", 50.8], ["A1", 53.34], ["A2", 55.88], ["A3", 58.42], ["A4", 60.96], ["A5", 63.5]];
    ana.forEach(function (p, i) {
      add("A" + (i + 1), p[1], 2.54, p[0], p[0]);
    });
    var dig10 = [["SCL", 18.796], ["SDA", 21.336], ["AREF", 23.876], ["GND", 26.416], ["D13", 28.956], ["D12", 31.496], ["D11", 34.036], ["D10", 36.576], ["D9", 39.116], ["D8", 41.656]];
    dig10.forEach(function (p, i) {
      add("D" + (i + 1), p[1], 50.8, p[0], p[0]);
    });
    var dig8 = [["D7", 45.72], ["D6", 48.26], ["D5", 50.8], ["D4", 53.34], ["D3", 55.88], ["D2", 58.42], ["D1", 60.96], ["D0", 63.5]];
    dig8.forEach(function (p, i) {
      add("E" + (i + 1), p[1], 50.8, p[0], p[0]);
    });
    var icsp = [["5V", 63.627, 30.48], ["MISO", 63.627, 27.94], ["RESET", 63.627, 25.4], ["GND", 66.167, 30.48], ["MOSI", 66.167, 27.94], ["SCK", 66.167, 25.4]];
    icsp.forEach(function (p, i) {
      add("I" + (i + 1), p[1], p[2], p[0], p[0]);
    });
    [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]].forEach(function (p, i) {
      pads.push({ id: "M" + (i + 1), x: p[0], y: p[1], drill: 3.2, dia: 5.0, group: "H", label: "M" + (i + 1), mechanical: true });
    });
    return pads;
  }

  function header(n) {
    var pads = [];
    for (var i = 0; i < n; i++) {
      var y = (i - (n - 1) / 2) * 2.54;
      var p = pad(String(i + 1), 0, y, 1.0, 1.75, String(i + 1), String(i + 1));
      if (i === 0) { p.shape = "rect"; p.w = 1.75; p.h = 1.75; }
      pads.push(p);
    }
    return {
      id: "hdr" + n,
      name: "排針 1×" + n,
      blurb: "2.54mm 直插，方形焊盤為腳 1",
      prefix: "J",
      pads: pads,
      box: { w: 3.6, h: n * 2.54 + 1.2 },
      draw: { kind: "header", n: n }
    };
  }

  var PARTS = [
    {
      id: "led",
      name: "LED 5mm",
      blurb: "5mm 直插發光二極管，腳距 2.54mm。A(+) 圓盤為長腳，K(-) 方盤平邊為短腳",
      prefix: "D",
      values: ["紅", "琥珀", "綠", "藍", "白"],
      value: "紅",
      pads: [
        pad("A", -1.27, 0, 0.9, 1.75, "A", "A"),
        { id: "K", x: 1.27, y: 0, drill: 0.9, dia: 1.75, w: 1.75, h: 1.75, shape: "rect", group: "K", label: "K" }
      ],
      box: { w: 6.4, h: 6.4 },
      draw: { kind: "led" }
    },
    {
      id: "res",
      name: "電阻 1/4W",
      blurb: "1/4W 色環軸向電阻，標準腳距 10.16mm（400 mil），鑽孔 0.8mm",
      prefix: "R",
      values: ["220", "330", "470", "1K", "4.7K", "10K"],
      value: "330",
      pads: [
        pad("1", -5.08, 0, 0.8, 1.6, "1", "1"),
        pad("2", 5.08, 0, 0.8, 1.6, "2", "2")
      ],
      box: { w: 12.6, h: 4.4 },
      draw: { kind: "res" }
    },
    {
      id: "ldr",
      name: "光敏電阻 GL5528",
      blurb: "5mm 光敏電阻（LDR），隨光線改變阻值，腳距 2.54mm",
      prefix: "R",
      pads: [
        pad("1", -1.27, 0, 0.8, 1.6, "1", "1"),
        pad("2", 1.27, 0, 0.8, 1.6, "2", "2")
      ],
      box: { w: 6.2, h: 5.4 },
      draw: { kind: "ldr" }
    },
    {
      id: "sw",
      name: "輕觸按鈕 6×6",
      blurb: "標準 6×6mm 四腳輕觸開關（6.5×4.5mm 腳距），同側 1a-1b、2a-2b 內部相通",
      prefix: "SW",
      pads: [
        pad("1a", -3.25, -2.25, 1.0, 1.8, "1", "1"),
        pad("1b", 3.25, -2.25, 1.0, 1.8, "1", "1"),
        pad("2a", -3.25, 2.25, 1.0, 1.8, "2", "2"),
        pad("2b", 3.25, 2.25, 1.0, 1.8, "2", "2")
      ],
      box: { w: 9.2, h: 7.4 },
      draw: { kind: "sw" }
    },
    {
      id: "ssw",
      name: "撥動開關 SS-12D00",
      blurb: "三腳單刀雙擲撥動開關，腳距 2.54mm，常作電源總開關（接 1 與 2）",
      prefix: "SW",
      pads: [
        { id: "1", x: -2.54, y: 0, drill: 0.9, dia: 1.7, w: 1.7, h: 1.7, shape: "rect", group: "1", label: "1" },
        pad("2", 0, 0, 0.9, 1.7, "2", "2"),
        pad("3", 2.54, 0, 0.9, 1.7, "3", "3")
      ],
      box: { w: 9.6, h: 5.0 },
      draw: { kind: "ssw" }
    },
    {
      id: "pot",
      name: "可調電阻 10K",
      blurb: "三腳直插可調電阻（電位器），1、3 接兩端，2 為中間調校腳",
      prefix: "VR",
      values: ["10K", "100K"],
      value: "10K",
      pads: [
        pad("1", -2.54, -2.54, 1.0, 1.8, "1", "1"),
        pad("2", 0, 2.54, 1.0, 1.8, "2", "2"),
        pad("3", 2.54, -2.54, 1.0, 1.8, "3", "3")
      ],
      box: { w: 8.2, h: 8.2 },
      draw: { kind: "pot" }
    },
    {
      id: "cap",
      name: "電容",
      blurb: "直插電容，腳距 2.54mm，+ 為長腳正極，方盤 - 為負極",
      prefix: "C",
      values: ["100nF", "10uF", "100uF"],
      value: "10uF",
      pads: [
        pad("+", -1.27, 0, 0.8, 1.6, "+", "+"),
        { id: "-", x: 1.27, y: 0, drill: 0.8, dia: 1.6, w: 1.6, h: 1.6, shape: "rect", group: "-", label: "-" }
      ],
      box: { w: 6.2, h: 6.2 },
      draw: { kind: "cap" }
    },
    {
      id: "buzz",
      name: "蜂鳴器 12mm",
      blurb: "Ø12mm 直插蜂鳴器（TMB12A05），標準腳距 7.62mm，+ 接訊號或正極",
      prefix: "BZ",
      pads: [
        pad("+", -3.81, 0, 0.9, 1.8, "+", "+"),
        pad("-", 3.81, 0, 0.9, 1.8, "-", "-")
      ],
      box: { w: 13.4, h: 13.4 },
      draw: { kind: "buzz" }
    },
    {
      id: "bat",
      name: "CR2032 電池座",
      blurb: "Ø20mm 鈕扣電池座（BS-7 / Keystone 106），兩腳直插腳距 20.32mm",
      prefix: "BT",
      pads: [
        pad("+", -10.16, 0, 1.2, 2.2, "+", "+"),
        pad("-", 10.16, 0, 1.2, 2.2, "-", "-")
      ],
      box: { w: 23.4, h: 22.2 },
      draw: { kind: "bat" }
    },
    {
      id: "srv",
      name: "舵機／感測器 3 針",
      blurb: "標準 G-V-S 三針排針（2.54mm），可直接插 SG90 舵機或 3 線感測器",
      prefix: "J",
      pads: [
        { id: "G", x: -2.54, y: 0, drill: 1.0, dia: 1.75, w: 1.75, h: 1.75, shape: "rect", group: "G", label: "G" },
        pad("V", 0, 0, 1.0, 1.75, "V", "V"),
        pad("S", 2.54, 0, 1.0, 1.75, "S", "S")
      ],
      box: { w: 8.6, h: 5.0 },
      draw: { kind: "srv" }
    },
    header(3),
    header(4),
    {
      id: "ubit",
      name: "micro:bit 插座",
      blurb: "BBC micro:bit 專用直插金手指母座（4UCON / Kitronik），焊接後直接將 micro:bit 插落卡槽",
      prefix: "U",
      pads: ubitPads(),
      box: { w: 58.2, h: 14.4 },
      draw: { kind: "ubit" }
    },
    {
      id: "uno",
      name: "Arduino UNO 插座",
      blurb: "塊板會變成 UNO R3 Shield，照官方尺寸與排母釘位疊在 UNO 上面",
      prefix: "U",
      edge: true,
      slab: { x: 0, y: 0, w: 68.58, h: 53.34 },
      footprints: [
        [26.2, 0.8, 38.8, 7.2],
        [17.2, 45.2, 47.8, 7.4],
        [62.0, 23.8, 5.8, 8.2],
        [11.0, 0.0, 5.8, 5.4],
        [12.2, 48.0, 5.8, 5.34],
        [63.2, 4.8, 5.38, 5.6],
        [63.2, 32.7, 5.38, 5.6]
      ],
      pads: unoPads(),
      box: { w: 68.58, h: 53.34 },
      draw: { kind: "uno" }
    },
    {
      id: "hole",
      name: "M3 鎖孔",
      blurb: "鍍孔 3.2mm，外環 6.0mm，可穿 M3 螺絲及銅柱固定電路板",
      prefix: "H",
      mechanical: true,
      pads: [pad("M", 0, 0, 3.2, 6.0, "M", "M")],
      box: { w: 6.8, h: 6.8 },
      draw: { kind: "hole" }
    }
  ];

  function partById(id) {
    for (var i = 0; i < PARTS.length; i++) if (PARTS[i].id === id) return PARTS[i];
    return null;
  }

  function blank(name) {
    return {
      version: 2,
      name: name || "我的電路板",
      w: 70,
      h: 45,
      outline: "rect",
      mask: "green",
      parts: [],
      nets: [],
      routes: [],
      unrouted: [],
      seq: 1
    };
  }

  function nextRef(doc, prefix) {
    var n = 1;
    var used = {};
    doc.parts.forEach(function (p) { used[p.ref] = 1; });
    while (used[prefix + n]) n++;
    return prefix + n;
  }

  function addPart(doc, type, x, y) {
    var spec = partById(type);
    if (!spec) throw new Error("unknown part " + type);
    var part = {
      uid: "p" + doc.seq++,
      type: type,
      x: snap(x),
      y: snap(y),
      rot: 0,
      ref: nextRef(doc, spec.prefix),
      value: spec.value || ""
    };
    doc.parts.push(part);
    doc.routes = [];
    return part;
  }

  function findPart(doc, uid) {
    for (var i = 0; i < doc.parts.length; i++) if (doc.parts[i].uid === uid) return doc.parts[i];
    return null;
  }

  function worldPads(part) {
    var spec = partById(part.type);
    var k = (part.rot / 90) | 0;
    return spec.pads.map(function (p) {
      var xy = rot90(p.x, p.y, k);
      var out = {
        id: p.id,
        x: r2(part.x + xy[0]),
        y: r2(part.y + xy[1]),
        drill: p.drill || 0,
        dia: p.dia,
        ring: !!p.ring,
        uid: part.uid,
        ref: part.ref,
        mechanical: !!(spec.mechanical || p.mechanical)
      };
      if (p.shape === "rect") {
        out.shape = "rect";
        var swap = k % 2 === 1;
        out.w = swap ? p.h : p.w;
        out.h = swap ? p.w : p.h;
      }
      if (p.group) {
        out.group = p.group;
        out.label = p.label || p.group;
      }
      return out;
    });
  }

  function bodyBox(part) {
    var spec = partById(part.type);
    if (spec.slab) {
      var k = (part.rot / 90) | 0;
      var sl = spec.slab;
      var corners = [[sl.x, sl.y], [sl.x + sl.w, sl.y], [sl.x + sl.w, sl.y + sl.h], [sl.x, sl.y + sl.h]];
      var xs = [], ys = [];
      corners.forEach(function (c) {
        var xy = rot90(c[0], c[1], k);
        xs.push(part.x + xy[0]);
        ys.push(part.y + xy[1]);
      });
      return {
        x: Math.min.apply(null, xs),
        y: Math.min.apply(null, ys),
        w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
        h: Math.max.apply(null, ys) - Math.min.apply(null, ys)
      };
    }
    var swap = ((part.rot / 90) | 0) % 2 === 1;
    var w = swap ? spec.box.h : spec.box.w;
    var h = swap ? spec.box.w : spec.box.h;
    return { x: part.x - w / 2, y: part.y - h / 2, w: w, h: h };
  }

  function siblings(part, padId) {
    var spec = partById(part.type);
    var group = null;
    spec.pads.forEach(function (p) {
      if (p.id === padId || p.group === padId) group = p.group;
    });
    if (!group) return [];
    return spec.pads.filter(function (p) { return p.group === group; }).map(function (p) { return p.id; });
  }

  function pinKey(uid, padId) { return uid + ":" + padId; }

  function netOf(doc, uid, padId) {
    var key = pinKey(uid, padId);
    for (var i = 0; i < doc.nets.length; i++) {
      var pins = doc.nets[i].pins;
      for (var j = 0; j < pins.length; j++) {
        if (pinKey(pins[j].uid, pins[j].pad) === key) return doc.nets[i];
      }
    }
    return null;
  }

  function addPins(net, part, padId) {
    siblings(part, padId).forEach(function (id) {
      var key = pinKey(part.uid, id);
      var exists = net.pins.some(function (p) { return pinKey(p.uid, p.pad) === key; });
      if (!exists) net.pins.push({ uid: part.uid, pad: id });
    });
  }

  function connect(doc, uid1, pad1, uid2, pad2) {
    if (uid1 === uid2 && pad1 === pad2) return null;
    var a = findPart(doc, uid1);
    var b = findPart(doc, uid2);
    if (!a || !b) return null;
    var sa = partById(a.type), sb = partById(b.type);
    if (sa.mechanical || sb.mechanical) return null;
    var pa = sa.pads.filter(function (p) { return p.id === pad1 || p.group === pad1; })[0];
    var pb = sb.pads.filter(function (p) { return p.id === pad2 || p.group === pad2; })[0];
    if (!pa || !pb || pa.mechanical || pb.mechanical) return null;
    var na = netOf(doc, uid1, pad1);
    var nb = netOf(doc, uid2, pad2);
    var net;
    if (na && nb && na !== nb) {
      na.pins = na.pins.concat(nb.pins);
      doc.nets = doc.nets.filter(function (n) { return n !== nb; });
      net = na;
    } else if (na) net = na;
    else if (nb) net = nb;
    else {
      net = { id: "n" + doc.seq++, name: "線路 " + (doc.nets.length + 1), pins: [] };
      doc.nets.push(net);
    }
    addPins(net, a, pad1);
    addPins(net, b, pad2);
    doc.routes = [];
    return net;
  }

  function removeNet(doc, id) {
    doc.nets = doc.nets.filter(function (n) { return n.id !== id; });
    doc.routes = [];
  }

  function disconnectPin(doc, uid, padId) {
    var part = findPart(doc, uid);
    if (!part) return;
    var drop = {};
    siblings(part, padId).forEach(function (id) { drop[pinKey(uid, id)] = 1; });
    doc.nets.forEach(function (n) {
      n.pins = n.pins.filter(function (p) { return !drop[pinKey(p.uid, p.pad)]; });
    });
    doc.nets = doc.nets.filter(function (n) { return n.pins.length >= 2; });
    doc.routes = [];
  }

  function removePart(doc, uid) {
    var removed = findPart(doc, uid);
    doc.parts = doc.parts.filter(function (p) { return p.uid !== uid; });
    if (removed && removed.type === "uno" && !doc.parts.some(function (p) { return p.type === "uno"; })) {
      doc.outline = "rect";
      doc.sigY = null;
    }
    doc.nets.forEach(function (n) {
      n.pins = n.pins.filter(function (p) { return p.uid !== uid; });
    });
    doc.nets = doc.nets.filter(function (n) { return n.pins.length >= 2; });
    doc.routes = [];
  }

  function rotatePart(doc, uid) {
    var p = findPart(doc, uid);
    if (!p) return;
    p.rot = (p.rot + 90) % 360;
    doc.routes = [];
  }

  function movePart(doc, uid, x, y) {
    var p = findPart(doc, uid);
    if (!p) return;
    p.x = snap(x);
    p.y = snap(y);
    doc.routes = [];
  }

  function setValue(doc, uid, value) {
    var p = findPart(doc, uid);
    if (p) p.value = value;
  }

  function renameNet(doc, id, name) {
    doc.nets.forEach(function (n) { if (n.id === id) n.name = name; });
  }

  function outlineLoops(doc) {
    if (doc.outline === "uno") {
      /* Official Arduino UNO R3 mechanical profile (68.58 x 53.34mm, origin
         bottom-left, y up): straight left edge at x=0 (USB-B at y=38.1,
         DC barrel jack at y=7.8), stepped right edge widening from 66.04 to
         68.58mm between y=3.81 and y=38.1 around the ICSP header and the two
         right M3 mounting holes, plus top-right 45-deg chamfer. */
      return [[
        [0, 0], [66.04, 0], [66.04, 1.27], [68.58, 3.81], [68.58, 38.1],
        [66.04, 40.64], [66.04, 51.816], [64.516, 53.34], [0, 53.34]
      ]];
    }
    return [[[0, 0], [doc.w, 0], [doc.w, doc.h], [0, doc.h]]];
  }

  function setOutline(doc, kind) {
    doc.outline = kind === "uno" ? "uno" : "rect";
  }

  function setBoard(doc, w, h) {
    if (doc.outline === "uno") return; /* the shield owns its size */
    doc.w = Math.max(20, Math.min(100, r2(w)));
    doc.h = Math.max(20, Math.min(100, r2(h)));
    doc.routes = [];
  }

  function groupsInNet(doc, net) {
    var map = {};
    net.pins.forEach(function (pin) {
      var part = findPart(doc, pin.uid);
      if (!part) return;
      var pads = worldPads(part).filter(function (p) { return p.id === pin.pad; });
      if (!pads.length) return;
      var key = pin.uid + ":" + pads[0].group;
      if (!map[key]) map[key] = { key: key, pads: [], ref: part.ref, label: pads[0].label };
      map[key].pads.push(pads[0]);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function Heap() { this.a = []; }
  Heap.prototype.push = function (c, i) {
    var a = this.a;
    a.push([c, i]);
    var n = a.length - 1;
    while (n > 0) {
      var p = (n - 1) >> 1;
      if (a[p][0] <= a[n][0]) break;
      var t = a[p]; a[p] = a[n]; a[n] = t;
      n = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a;
    if (!a.length) return null;
    var top = a[0];
    var last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = i * 2 + 1, r = l + 1, s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        var t = a[s]; a[s] = a[i]; a[i] = t;
        i = s;
      }
    }
    return top;
  };

  function gridSize(doc) {
    return { gw: Math.floor(doc.w / CELL) + 1, gh: Math.floor(doc.h / CELL) + 1 };
  }

  function cellsIn(cx, cy, rad, gw, gh) {
    var out = [];
    var x0 = Math.max(0, Math.floor((cx - rad) / CELL));
    var x1 = Math.min(gw - 1, Math.ceil((cx + rad) / CELL));
    var y0 = Math.max(0, Math.floor((cy - rad) / CELL));
    var y1 = Math.min(gh - 1, Math.ceil((cy + rad) / CELL));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (dist(x * CELL, y * CELL, cx, cy) <= rad + 1e-6) out.push(y * gw + x);
      }
    }
    return out;
  }

  function routePair(doc, sourcePads, goalPads, blockedBase, prefer) {
    var g = gridSize(doc);
    var gw = g.gw, gh = g.gh, ncell = gw * gh;
    var own = new Uint8Array(ncell);
    var starts = [];
    var goals = new Uint8Array(ncell);
    function mark(pads, intoStart) {
      pads.forEach(function (p) {
        cellsIn(p.x, p.y, p.dia / 2 - 0.02, gw, gh).forEach(function (idx) {
          own[idx] = 1;
          if (intoStart) starts.push(idx);
          else goals[idx] = 1;
        });
      });
    }
    mark(sourcePads, true);
    mark(goalPads, false);
    if (!starts.length) return null;
    var hit = false;
    for (var s = 0; s < starts.length; s++) if (goals[starts[s]] && goalPads.length && sourcePads !== goalPads) {
      /* overlapping copper already connects */
    }
    for (var i = 0; i < starts.length; i++) {
      var cell = starts[i];
      var insideGoal = false;
      goalPads.forEach(function (p) {
        if (dist((cell % gw) * CELL, Math.floor(cell / gw) * CELL, p.x, p.y) <= p.dia / 2) insideGoal = true;
      });
      if (insideGoal) return { segs: [], vias: [], cells: [] };
    }

    var cost = new Int16Array(ncell * 2);
    for (i = 0; i < cost.length; i++) cost[i] = 32767;
    var parent = new Int32Array(ncell * 2);
    for (i = 0; i < parent.length; i++) parent[i] = -1;
    var heap = new Heap();
    var layer0 = prefer === 1 ? 1 : 0;
    starts.forEach(function (idx) {
      for (var layer = 0; layer < 2; layer++) {
        var id = layer * ncell + idx;
        var c = layer === layer0 ? 0 : 1;
        cost[id] = c;
        heap.push(c, id);
      }
    });
    var found = -1;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (heap.a.length) {
      var item = heap.pop();
      var c0 = item[0], id0 = item[1];
      if (c0 !== cost[id0]) continue;
      var layer = id0 >= ncell ? 1 : 0;
      var idx = id0 - layer * ncell;
      var gx = idx % gw, gy = (idx / gw) | 0;
      var onGoal = false;
      if (goals[idx]) {
        goalPads.forEach(function (p) {
          if (dist(gx * CELL, gy * CELL, p.x, p.y) <= p.dia / 2) onGoal = true;
        });
        var onSource = false;
        sourcePads.forEach(function (p) {
          if (dist(gx * CELL, gy * CELL, p.x, p.y) <= p.dia / 2) onSource = true;
        });
        if (onGoal && !onSource) { found = id0; break; }
      }
      for (var d = 0; d < 4; d++) {
        var nx = gx + dirs[d][0], ny = gy + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        var nidx = ny * gw + nx;
        if (blockedBase[layer * ncell + nidx] && !own[nidx]) continue;
        var step = layer === layer0 ? 1 : 2;
        var nc = c0 + step;
        var nid = layer * ncell + nidx;
        if (nc < cost[nid]) {
          cost[nid] = nc;
          parent[nid] = id0;
          heap.push(nc, nid);
        }
      }
      var edge = gx * CELL < 1 || gy * CELL < 1 || gx * CELL > doc.w - 1 || gy * CELL > doc.h - 1;
      if (!edge && !(blockedBase[0 * ncell + idx] && blockedBase[1 * ncell + idx] && !own[idx])) {
        var other = (1 - layer) * ncell + idx;
        var vc = c0 + (own[idx] ? 0 : 5);
        if (!own[idx] && (blockedBase[0 * ncell + idx] || blockedBase[1 * ncell + idx])) vc = 99999;
        if (vc < cost[other]) {
          cost[other] = vc;
          parent[other] = id0;
          heap.push(vc, other);
        }
      }
    }
    if (found < 0) return null;
    var pts = [];
    var idc = found;
    var guard = 0;
    while (idc >= 0 && guard++ < 20000) {
      var ly = idc >= ncell ? 1 : 0;
      var ci = idc - ly * ncell;
      pts.push({ x: (ci % gw) * CELL, y: ((ci / gw) | 0) * CELL, layer: ly, idx: ci });
      idc = parent[idc];
    }
    pts.reverse();
    var segs = [];
    var vias = [];
    var cur = null;
    for (i = 0; i < pts.length; i++) {
      if (!cur || cur.layer !== pts[i].layer) {
        if (cur && cur.pts.length) segs.push(cur);
        if (cur && !own[pts[i].idx]) vias.push([r2(pts[i].x), r2(pts[i].y)]);
        cur = { layer: pts[i].layer, pts: [[r2(pts[i].x), r2(pts[i].y)]] };
      } else if (cur.pts.length === 0 || cur.pts[cur.pts.length - 1][0] !== r2(pts[i].x) || cur.pts[cur.pts.length - 1][1] !== r2(pts[i].y)) {
        cur.pts.push([r2(pts[i].x), r2(pts[i].y)]);
      }
    }
    if (cur && cur.pts.length) segs.push(cur);
    function extend(end, pads) {
      var best = null, bestD = 1e9;
      pads.forEach(function (p) {
        var dd = dist(end[0], end[1], p.x, p.y);
        if (dd < bestD) { bestD = dd; best = p; }
      });
      if (best && bestD > 0.05 && bestD < best.dia / 2 + 0.2) return [r2(best.x), r2(best.y)];
      return null;
    }
    if (segs.length && pts.length) {
      var first = segs[0];
      var ext = extend(first.pts[0], sourcePads);
      if (ext) first.pts.unshift(ext);
      var last = segs[segs.length - 1];
      ext = extend(last.pts[last.pts.length - 1], goalPads);
      if (ext) last.pts.push(ext);
    }
    var cells = pts.map(function (p) { return p.layer * ncell + p.idx; });
    return { segs: segs, vias: vias, cells: cells };
  }

  function foreignPads(doc, net) {
    var own = {};
    net.pins.forEach(function (p) { own[pinKey(p.uid, p.pad)] = 1; });
    var out = [];
    doc.parts.forEach(function (part) {
      worldPads(part).forEach(function (p) {
        if (!own[pinKey(part.uid, p.id)]) out.push(p);
      });
    });
    return out;
  }

  function paintBlocked(doc, net, extraTraces) {
    var g = gridSize(doc);
    var ncell = g.gw * g.gh;
    var blocked = new Uint8Array(ncell * 2);
    function blockCircle(x, y, rad, layers) {
      cellsIn(x, y, rad, g.gw, g.gh).forEach(function (idx) {
        for (var L = 0; L < layers.length; L++) blocked[layers[L] * ncell + idx] = 1;
      });
    }
    for (var x = 0; x < g.gw; x++) {
      for (var y = 0; y < g.gh; y++) {
        var xm = x * CELL, ym = y * CELL;
        if (xm < EDGE_KEEP || ym < EDGE_KEEP || xm > doc.w - EDGE_KEEP || ym > doc.h - EDGE_KEEP) {
          blocked[y * g.gw + x] = 1;
          blocked[ncell + y * g.gw + x] = 1;
        }
      }
    }
    foreignPads(doc, net).forEach(function (p) {
      var rad = p.shape === "rect" ? Math.max(p.w, p.h) / 2 : p.dia / 2;
      blockCircle(p.x, p.y, rad + CLEAR + TRACE / 2, [0, 1]);
    });
    extraTraces.forEach(function (tr) {
      (tr.segs || []).forEach(function (seg) {
        seg.pts.forEach(function (pt) {
          blockCircle(pt[0], pt[1], TRACE / 2 + CLEAR + TRACE / 2 - 0.01, [seg.layer]);
        });
      });
      (tr.vias || []).forEach(function (v) {
        blockCircle(v[0], v[1], VIA_PAD / 2 + CLEAR + TRACE / 2, [0, 1]);
      });
    });
    return blocked;
  }

  function route(doc) {
    doc.routes = [];
    doc.unrouted = [];
    var nets = doc.nets.slice().sort(function (a, b) { return a.pins.length - b.pins.length; });
    nets.forEach(function (net) {
      var groups = groupsInNet(doc, net);
      if (groups.length < 2) return;
      var linked = [0];
      var pending = [];
      for (var i = 1; i < groups.length; i++) pending.push(i);
      var prefer = /負|地|GND|gnd/.test(net.name) ? 1 : 0;
      while (pending.length) {
        var best = null;
        linked.forEach(function (li) {
          pending.forEach(function (pi) {
            groups[li].pads.forEach(function (a) {
              groups[pi].pads.forEach(function (b) {
                var d = dist(a.x, a.y, b.x, b.y);
                if (!best || d < best.d) best = { d: d, li: li, pi: pi, ax: a.x, ay: a.y, bx: b.x, by: b.y };
              });
            });
          });
        });
        var blocked = paintBlocked(doc, net, doc.routes.filter(function (r) { return r.netId !== net.id; }));
        var existing = doc.routes.filter(function (r) { return r.netId === net.id; });
        var source = [];
        linked.forEach(function (li) { source = source.concat(groups[li].pads); });
        existing.forEach(function (r) {
          (r.segs || []).forEach(function (seg) {
            seg.pts.forEach(function (pt) {
              source.push({ x: pt[0], y: pt[1], dia: TRACE });
            });
          });
        });
        var goal = groups[best.pi].pads;
        var result = routePair(doc, source, goal, blocked, prefer);
        if (!result) {
          doc.unrouted.push({
            netId: net.id,
            from: groups[best.li].ref + " " + groups[best.li].label,
            to: groups[best.pi].ref + " " + groups[best.pi].label,
            fromPt: [r2(best.ax), r2(best.ay)],
            toPt: [r2(best.bx), r2(best.by)]
          });
          pending = pending.filter(function (p) { return p !== best.pi; });
          continue;
        }
        var routeObj = doc.routes.filter(function (r) { return r.netId === net.id; })[0];
        if (!routeObj) {
          routeObj = { netId: net.id, segs: [], vias: [] };
          doc.routes.push(routeObj);
        }
        result.segs.forEach(function (s) { if (s.pts.length > 1) routeObj.segs.push(s); });
        result.vias.forEach(function (v) { routeObj.vias.push(v); });
        linked.push(best.pi);
        pending = pending.filter(function (p) { return p !== best.pi; });
      }
    });
    return doc;
  }

  function partRects(part) {
    var spec = partById(part.type);
    if (!spec.footprints) return [bodyBox(part)];
    var k = (part.rot / 90) | 0;
    return spec.footprints.map(function (f) {
      /* f = [x0, y0, w, h] local, y up; rotate corners like bodyBox */
      var corners = [[f[0], f[1]], [f[0] + f[2], f[1]], [f[0] + f[2], f[1] + f[3]], [f[0], f[1] + f[3]]];
      var xs = [], ys = [];
      corners.forEach(function (c) {
        var xy = rot90(c[0], c[1], k);
        xs.push(part.x + xy[0]);
        ys.push(part.y + xy[1]);
      });
      return {
        x: Math.min.apply(null, xs),
        y: Math.min.apply(null, ys),
        w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
        h: Math.max.apply(null, ys) - Math.min.apply(null, ys)
      };
    });
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function check(doc) {
    var errors = [];
    var warnings = [];
    if (!doc.routes.length && doc.nets.length) warnings.push({ code: "noroute", msg: "尚未走線" });
    doc.unrouted.forEach(function (u) {
      var net = doc.nets.filter(function (n) { return n.id === u.netId; })[0];
      errors.push({ code: "nopath", net: net ? net.name : "", from: u.from, to: u.to, msg: (net ? net.name : "線路") + " 走不到：" + u.from + " 到 " + u.to });
    });
    for (var i = 0; i < doc.parts.length; i++) {
      var box = bodyBox(doc.parts[i]);
      if (box.x < -0.02 || box.y < -0.02 || box.x + box.w > doc.w + 0.02 || box.y + box.h > doc.h + 0.02) {
        errors.push({ code: "off", ref: doc.parts[i].ref, msg: doc.parts[i].ref + " 超出板邊" });
      }
      for (var j = i + 1; j < doc.parts.length; j++) {
        var hit = false;
        partRects(doc.parts[i]).forEach(function (ra) {
          partRects(doc.parts[j]).forEach(function (rb) {
            if (boxesOverlap(ra, rb)) hit = true;
          });
        });
        if (hit) {
          errors.push({ code: "hit", a: doc.parts[i].ref, b: doc.parts[j].ref, msg: doc.parts[i].ref + " 與 " + doc.parts[j].ref + " 相撞" });
        }
      }
    }
    var pads = [];
    doc.parts.forEach(function (part) { worldPads(part).forEach(function (p) { pads.push(p); }); });
    for (i = 0; i < pads.length; i++) {
      for (j = i + 1; j < pads.length; j++) {
        if (pads[i].uid === pads[j].uid) continue; /* library footprints are trusted */
        var gap = dist(pads[i].x, pads[i].y, pads[j].x, pads[j].y) - pads[i].dia / 2 - pads[j].dia / 2;
        var same = netOf(doc, pads[i].uid, pads[i].id) && netOf(doc, pads[i].uid, pads[i].id) === netOf(doc, pads[j].uid, pads[j].id);
        var internal = pads[i].uid === pads[j].uid && pads[i].group === pads[j].group;
        if (gap < 0.15 && !same && !internal) {
          errors.push({ code: "close", a: pads[i].ref, b: pads[j].ref, msg: pads[i].ref + " 與 " + pads[j].ref + " 焊盤太近" });
        }
      }
    }
    return { errors: errors, warnings: warnings, ok: errors.length === 0 };
  }

  var FONT = {
    "0": [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]],
    "1": [[[2, 0], [2, 6]], [[1, 0], [3, 0]]],
    "2": [[[0, 6], [4, 6], [4, 3], [0, 3], [0, 0], [4, 0]]],
    "3": [[[0, 6], [4, 6], [4, 0], [0, 0]], [[0, 3], [4, 3]]],
    "4": [[[0, 6], [0, 3], [4, 3]], [[4, 6], [4, 0]]],
    "5": [[[4, 6], [0, 6], [0, 3], [4, 3], [4, 0], [0, 0]]],
    "6": [[[4, 6], [0, 6], [0, 0], [4, 0], [4, 3], [0, 3]]],
    "7": [[[0, 6], [4, 6], [4, 0]]],
    "8": [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0], [0, 3], [4, 3]]],
    "9": [[[4, 0], [4, 6], [0, 6], [0, 3], [4, 3]]],
    A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]],
    B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
    C: [[[4, 6], [1, 6], [0, 5], [0, 1], [1, 0], [4, 0]]],
    D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
    E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
    F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
    G: [[[4, 6], [1, 6], [0, 5], [0, 1], [1, 0], [4, 0], [4, 3], [2, 3]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
    J: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
    K: [[[0, 0], [0, 6]], [[4, 6], [0, 3], [4, 0]]],
    L: [[[0, 6], [0, 0], [4, 0]]],
    M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
    N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
    O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
    P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
    Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2, 2], [4, 0]]],
    R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
    S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
    T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
    U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
    V: [[[0, 6], [2, 0], [4, 6]]],
    W: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
    X: [[[0, 6], [4, 0]], [[4, 6], [0, 0]]],
    Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
    Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
    "+": [[[2, 1], [2, 5]], [[0, 3], [4, 3]]],
    "-": [[[0, 3], [4, 3]]],
    ".": [[[1.5, 0], [2.5, 0]]]
  };

  function strokeText(text, x, y, h) {
    var scale = h / 6;
    var strokes = [];
    var cursor = x;
    String(text).toUpperCase().split("").forEach(function (ch) {
      if (ch === " ") { cursor += 3 * scale; return; }
      var g = FONT[ch];
      if (!g) { cursor += 5 * scale; return; }
      g.forEach(function (line) {
        var pts = line.map(function (p) { return [r2(cursor + p[0] * scale), r2(y + p[1] * scale)]; });
        strokes.push(pts);
      });
      cursor += 5 * scale;
    });
    return { strokes: strokes, width: cursor - x };
  }

  var DEFAULT_ASCII = {
    "LED 小燈": "LED LIGHT",
    "排針小燈": "PIN LIGHT",
    "micro:bit 小燈": "MICROBIT LIGHT",
    "UNO 小燈": "UNO LIGHT",
    "我的電路板": "MY PCB"
  };

  function asciiName(name) {
    var raw = DEFAULT_ASCII[name] || String(name || "");
    var s = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    return s.slice(0, 16) || "BOARD";
  }

  function simplifyPts(pts) {
    if (!pts || pts.length <= 2) return pts ? pts.slice() : [];
    var out = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      var dx1 = b[0] - a[0], dy1 = b[1] - a[1];
      var dx2 = c[0] - b[0], dy2 = c[1] - b[1];
      var cross = Math.abs(dx1 * dy2 - dy1 * dx2);
      var dot = dx1 * dx2 + dy1 * dy2;
      if (cross < 1e-5 && dot >= 0) continue;
      out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function gnum(mm) {
    var n = Math.round(mm * 1e6);
    return (n < 0 ? "-" : "") + String(Math.abs(n));
  }

  function gerberHeader(fn, date) {
    return [
      "G04 PCB Studio*",
      "%TF.GenerationSoftware,Cloof,PCBStudio,0.1*%",
      "%TF.CreationDate," + date + "*%",
      "%TF.FileFunction," + fn + "*%",
      "%TF.FilePolarity,Positive*%",
      "%FSLAX46Y46*%",
      "%MOMM*%",
      "%LPD*%",
      "G01*"
    ];
  }

  function Apertures() {
    this.list = [];
    this.map = {};
  }
  Apertures.prototype.add = function (kind, a, b) {
    var key = kind + ":" + a + ":" + (b || 0);
    if (this.map[key]) return this.map[key];
    var code = 10 + this.list.length;
    this.map[key] = code;
    this.list.push({ code: code, kind: kind, a: a, b: b });
    return code;
  };
  Apertures.prototype.defs = function () {
    return this.list.map(function (d) {
      if (d.kind === "C") return "%ADD" + d.code + "C," + d.a.toFixed(6) + "*%";
      return "%ADD" + d.code + "R," + d.a.toFixed(6) + "X" + d.b.toFixed(6) + "*%";
    });
  };

  function flash(ap, x, y) {
    return "D" + ap + "*\nX" + gnum(x) + "Y" + gnum(y) + "D03*";
  }
  function drawChain(ap, pts) {
    if (!pts || pts.length < 2) return "";
    var lines = ["D" + ap + "*", "X" + gnum(pts[0][0]) + "Y" + gnum(pts[0][1]) + "D02*"];
    for (var i = 1; i < pts.length; i++) lines.push("X" + gnum(pts[i][0]) + "Y" + gnum(pts[i][1]) + "D01*");
    return lines.join("\n");
  }

  function allPads(doc) {
    var out = [];
    doc.parts.forEach(function (part) { worldPads(part).forEach(function (p) { out.push(p); }); });
    return out;
  }

  function allVias(doc) {
    var out = [];
    (doc.routes || []).forEach(function (r) {
      (r.vias || []).forEach(function (v) { out.push(v); });
    });
    return out;
  }

  function copperFile(doc, layer, date) {
    var fn = layer === 0 ? "Copper,L1,Top" : "Copper,L2,Bot";
    var ap = new Apertures();
    var body = [];
    allPads(doc).forEach(function (p) {
      if (p.shape === "rect") {
        body.push(flash(ap.add("R", p.w, p.h), p.x, p.y));
      } else {
        body.push(flash(ap.add("C", p.dia), p.x, p.y));
      }
    });
    allVias(doc).forEach(function (v) {
      body.push(flash(ap.add("C", VIA_PAD), v[0], v[1]));
    });
    var traceAp = ap.add("C", TRACE);
    (doc.routes || []).forEach(function (r) {
      (r.segs || []).forEach(function (seg) {
        if (seg.layer !== layer) return;
        var d = drawChain(traceAp, simplifyPts(seg.pts));
        if (d) body.push(d);
      });
    });
    return gerberHeader(fn, date).concat(ap.defs()).concat(body).concat("M02*").join("\n") + "\n";
  }

  function maskFile(doc, top, date) {
    var ap = new Apertures();
    var body = [];
    allPads(doc).forEach(function (p) {
      if (p.shape === "rect") {
        body.push(flash(ap.add("R", p.w + MASK * 2, p.h + MASK * 2), p.x, p.y));
      } else {
        body.push(flash(ap.add("C", p.dia + MASK * 2), p.x, p.y));
      }
    });
    allVias(doc).forEach(function (v) {
      body.push(flash(ap.add("C", VIA_PAD + MASK * 2), v[0], v[1]));
    });
    var fn = top ? "Soldermask,Top" : "Soldermask,Bot";
    return gerberHeader(fn, date).concat(ap.defs()).concat(body).concat("M02*").join("\n") + "\n";
  }

  function silkFile(doc, top, date) {
    var ap = new Apertures();
    var pen = null;
    var body = [];
    function line(pts) {
      if (!pen) pen = ap.add("C", 0.15);
      var d = drawChain(pen, pts);
      if (d) body.push(d);
    }
    if (top) {
      doc.parts.forEach(function (part) {
        var spec = partById(part.type);
        var k = (part.rot / 90) | 0;
        function L(x1, y1, x2, y2) {
          var a = rot90(x1, y1, k), b = rot90(x2, y2, k);
          line([[r2(part.x + a[0]), r2(part.y + a[1])], [r2(part.x + b[0]), r2(part.y + b[1])]]);
        }
        function rect(w, h) {
          L(-w / 2, -h / 2, w / 2, -h / 2);
          L(w / 2, -h / 2, w / 2, h / 2);
          L(w / 2, h / 2, -w / 2, h / 2);
          L(-w / 2, h / 2, -w / 2, -h / 2);
        }
        if (spec.draw.kind === "led") {
          var pts = [];
          for (var a = -7; a <= 7; a++) {
            var ang = (a / 9) * Math.PI;
            var xy = rot90(Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, k);
            pts.push([r2(part.x + xy[0]), r2(part.y + xy[1])]);
          }
          pts.push(pts[0]);
          line(pts);
        } else if (spec.draw.kind === "res") {
          rect(6.4, 2.2);
          L(-4.0, 0, -3.2, 0);
          L(3.2, 0, 4.0, 0);
        } else if (spec.draw.kind === "ldr") {
          rect(4.6, 3.8);
          L(-1.2, -0.8, 1.2, -0.8);
          L(1.2, -0.8, -1.2, 0);
          L(-1.2, 0, 1.2, 0);
          L(1.2, 0, -1.2, 0.8);
          L(-1.2, 0.8, 1.2, 0.8);
        } else if (spec.draw.kind === "sw") {
          L(-2.1, -3.0, 2.1, -3.0);
          L(-2.1, 3.0, 2.1, 3.0);
          L(-1.8, -2.25, 1.8, -2.25);
          L(-1.8, 2.25, 1.8, 2.25);
        } else if (spec.draw.kind === "ssw") {
          rect(8.6, 3.8);
          rect(2.2, 2.0);
        } else if (spec.draw.kind === "pot") {
          rect(6.8, 6.8);
          var ppts = [];
          for (a = 0; a <= 16; a++) {
            ang = (a / 16) * Math.PI * 2;
            xy = rot90(Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, k);
            ppts.push([r2(part.x + xy[0]), r2(part.y + xy[1])]);
          }
          line(ppts);
        } else if (spec.draw.kind === "cap") {
          var kpts = [];
          for (a = 0; a <= 16; a++) {
            ang = (a / 16) * Math.PI * 2;
            xy = rot90(Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, k);
            kpts.push([r2(part.x + xy[0]), r2(part.y + xy[1])]);
          }
          line(kpts);
          L(1.9, -1.2, 1.9, 1.2);
        } else if (spec.draw.kind === "buzz") {
          var cpts = [];
          for (a = 0; a <= 20; a++) {
            ang = (a / 20) * Math.PI * 2;
            xy = rot90(Math.cos(ang) * 5.8, Math.sin(ang) * 5.8, k);
            cpts.push([r2(part.x + xy[0]), r2(part.y + xy[1])]);
          }
          line(cpts);
        } else if (spec.draw.kind === "bat") {
          var bpts = [];
          for (a = -12; a <= 12; a++) {
            ang = (a / 16) * Math.PI;
            xy = rot90(Math.sin(ang) * 10.4, -Math.cos(ang) * 10.4, k);
            bpts.push([r2(part.x + xy[0]), r2(part.y + xy[1])]);
          }
          bpts.push(bpts[0]);
          line(bpts);
        } else if (spec.draw.kind === "srv") {
          rect(7.6, 2.54);
          ["G", "V", "S"].forEach(function (lb, idx) {
            var sp = rot90((idx - 1) * 2.54 - 0.35, 1.7, k);
            if (part.x + sp[0] > 0.6 && part.x + sp[0] < doc.w - 1.2 && part.y + sp[1] > 0.6 && part.y + sp[1] < doc.h - 1.2) {
              strokeText(lb, part.x + sp[0], part.y + sp[1], 0.72).strokes.forEach(line);
            }
          });
        } else if (spec.draw.kind === "header") {
          rect(2.54, spec.draw.n * 2.54);
          var p1 = worldPads(part)[0];
          line([[p1.x - 1.3, p1.y], [p1.x - 1.3, p1.y + 0.8]]);
        } else if (spec.draw.kind === "uno") {
          (spec.footprints || []).forEach(function (fp) {
            var x0 = fp[0], y0 = fp[1], fw = fp[2], fh = fp[3];
            line([[x0, y0], [x0 + fw, y0], [x0 + fw, y0 + fh], [x0, y0 + fh], [x0, y0]]);
          });
          worldPads(part).forEach(function (p) {
            if (p.group === "NC" || p.group === "H") return;
            var up = p.y < 40; /* power row: label runs upward */
            var ay = up ? p.y + 1.3 : p.y - 1.3;
            if (ay < 0.5 || ay > doc.h - 0.5 || p.x < 0.6 || p.x > doc.w - 0.6) return;
            var laid = strokeText(p.label, 0, 0, 0.68);
            laid.strokes.forEach(function (pts) {
              line(pts.map(function (pt) {
                return up ? [r2(p.x - pt[1]), r2(ay + pt[0])] : [r2(p.x + pt[1]), r2(ay - pt[0])];
              }));
            });
          });
        } else if (spec.draw.kind === "ubit") {
          rect(56.8, 8.8);
          L(-25.8, -0.5, 25.8, -0.5);
          L(-25.8, 0.5, 25.8, 0.5);
          spec.pads.forEach(function (lp) {
            if (!lp.ring) return;
            var off = rot90(lp.x, lp.y >= 0 ? 3.2 : -3.2, k);
            var tx = part.x + off[0] - (lp.label.length * 0.35);
            var ty = part.y + off[1] - 0.35;
            if (tx > 0.6 && tx < doc.w - 2.4 && ty > 0.6 && ty < doc.h - 1.4) {
              strokeText(lp.label, tx, ty, 0.78).strokes.forEach(line);
            }
          });
        } else if (spec.draw.kind === "hole") {
          var hpts = [];
          for (a = 0; a <= 16; a++) {
            ang = (a / 16) * Math.PI * 2;
            hpts.push([r2(part.x + Math.cos(ang) * 3.25), r2(part.y + Math.sin(ang) * 3.25)]);
          }
          line(hpts);
        }
        if (part.type !== "hole" && part.type !== "uno") {
          var label = part.ref + (part.value && (part.type === "res" || part.type === "cap" || part.type === "pot") ? " " + part.value : "");
          var box = bodyBox(part);
          var laid = strokeText(label, box.x, box.y + box.h + 0.6, 1.05);
          if (laid.width > 0 && box.y + box.h + 1.8 < doc.h - 0.4) laid.strokes.forEach(line);
        }
        worldPads(part).forEach(function (p) {
          if (p.label !== "+" && p.label !== "A") return;
          var dx = p.x - part.x, dy = p.y - part.y;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var mx = p.x + (dx / len) * (p.dia / 2 + 1.3);
          var my = p.y + (dy / len) * (p.dia / 2 + 1.3);
          if (mx < 0.8 || my < 0.8 || mx > doc.w - 1.6 || my > doc.h - 1.6) return;
          strokeText("+", mx, my, 1.0).strokes.forEach(line);
        });
      });
      var edgeR = doc.outline === "uno" ? 58.0 : doc.w;
      var titleX = doc.outline === "uno" ? 4.0 : 1.2;
      var titleY = doc.sigTop ? doc.h - 2.2 : (doc.sigY != null ? doc.sigY : 1.0);
      var title = strokeText(asciiName(doc.name), titleX, titleY, 1.2);
      title.strokes.forEach(line);
      if (doc.sig) {
        var sigW = strokeText("CLOOF SIU", 0, 0, 1.2).width;
        strokeText("CLOOF SIU", r2(edgeR - 1.4 - sigW), titleY, 1.2).strokes.forEach(line);
      }
    } else {
      line([[1, 1], [3, 1]]);
    }
    var fn = top ? "Legend,Top" : "Legend,Bot";
    return gerberHeader(fn, date).concat(ap.defs()).concat(body).concat("M02*").join("\n") + "\n";
  }

  function edgeFile(doc, date) {
    var ap = new Apertures();
    var code = ap.add("C", 0.1);
    var body = [];
    outlineLoops(doc).forEach(function (loop) {
      var pts = loop.slice();
      pts.push(pts[0]);
      var d = drawChain(code, pts);
      if (d) body.push(d);
    });
    return gerberHeader("Profile,NP", date).concat(ap.defs()).concat(body).concat("M02*").join("\n") + "\n";
  }

  function drillFile(doc, date) {
    var tools = {};
    function add(dia, x, y) {
      var key = dia.toFixed(3);
      if (!tools[key]) tools[key] = [];
      var sig = x.toFixed(3) + "," + y.toFixed(3);
      if (tools[key].some(function (p) { return p.sig === sig; })) return;
      tools[key].push({ x: x, y: y, sig: sig });
    }
    allPads(doc).forEach(function (p) {
      if (!p.drill) return; /* edge fingers have no holes */
      add(p.drill, p.x, p.y);
    });
    allVias(doc).forEach(function (v) { add(VIA_DRILL, v[0], v[1]); });
    var keys = Object.keys(tools).sort();
    var lines = [
      "M48",
      "; DRILL file PCB Studio",
      "; FORMAT={-:-/ absolute / metric / decimal}",
      "; #@! TF.CreationDate," + date,
      "; #@! TF.GenerationSoftware,Cloof,PCBStudio,0.1",
      "; #@! TF.FileFunction,Plated,1,2,PTH",
      "FMAT,2",
      "METRIC,TZ"
    ];
    keys.forEach(function (k, i) { lines.push("T" + (i + 1) + "C" + k); });
    lines.push("%", "G90", "G05");
    keys.forEach(function (k, i) {
      lines.push("T" + (i + 1));
      tools[k].forEach(function (p) {
        lines.push("X" + p.x.toFixed(3) + "Y" + p.y.toFixed(3));
      });
    });
    lines.push("T0", "M30");
    return lines.join("\n") + "\n";
  }

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function strBytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255);
    return out;
  }
  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  function zipStore(files) {
    var locals = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var name = strBytes(f.name);
      var data = f.data;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
        name
      );
      locals.push(local, Array.prototype.slice.call(data));
      central.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), name
      ));
      offset += local.length + data.length;
    });
    var centralFlat = [];
    central.forEach(function (c) { centralFlat = centralFlat.concat(c); });
    var eocd = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralFlat.length), u32(offset), u16(0)
    );
    var all = [];
    locals.forEach(function (chunk) { all = all.concat(chunk); });
    all = all.concat(centralFlat, eocd);
    return new Uint8Array(all);
  }

  function exportZip(doc) {
    if (!doc.routes.length && doc.nets.length) route(doc);
    var date = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
    var files = [
      ["board-F_Cu.gtl", copperFile(doc, 0, date)],
      ["board-B_Cu.gbl", copperFile(doc, 1, date)],
      ["board-F_Mask.gts", maskFile(doc, true, date)],
      ["board-B_Mask.gbs", maskFile(doc, false, date)],
      ["board-F_Silkscreen.gto", silkFile(doc, true, date)],
      ["board-B_Silkscreen.gbo", silkFile(doc, false, date)],
      ["board-Edge_Cuts.gko", edgeFile(doc, date)],
      ["board.drl", drillFile(doc, date)]
    ];
    return zipStore(files.map(function (f) {
      return { name: f[0], data: new Uint8Array(strBytes(f[1])) };
    }));
  }

  function template(id) {
    var doc;
    if (id === "led") {
      doc = blank("LED 小燈");
      doc.w = 80;
      doc.h = 50;
      var bt = addPart(doc, "bat", 20.32, 25.4);
      var sw = addPart(doc, "sw", 43.18, 16.51);
      var res = addPart(doc, "res", 43.18, 34.29);
      res.value = "330";
      var led = addPart(doc, "led", 64.77, 25.4);
      connect(doc, bt.uid, "+", sw.uid, "1a");
      connect(doc, sw.uid, "2a", res.uid, "1");
      connect(doc, res.uid, "2", led.uid, "A");
      connect(doc, led.uid, "K", bt.uid, "-");
      doc.nets.forEach(function (n, i) {
        n.name = ["電池正極", "按鈕之後", "燈的正極", "電池負極"][i] || n.name;
      });
      return doc;
    }
    if (id === "header") {
      doc = blank("排針小燈");
      doc.w = 70;
      doc.h = 45;
      var j = addPart(doc, "hdr3", 12.7, 22.86);
      var sw2 = addPart(doc, "sw", 31.75, 15.24);
      var r = addPart(doc, "res", 46.99, 29.21);
      r.value = "330";
      var d = addPart(doc, "led", 59.69, 22.86);
      connect(doc, j.uid, "1", r.uid, "1");
      connect(doc, r.uid, "2", d.uid, "A");
      connect(doc, d.uid, "K", sw2.uid, "1a");
      connect(doc, sw2.uid, "2a", j.uid, "3");
      doc.nets[0].name = "排針供電";
      doc.nets[1].name = "燈的正極";
      doc.nets[2].name = "按鈕之後";
      doc.nets[3].name = "接地";
      return doc;
    }
    if (id === "ubit") {
      /* BBC micro:bit Breakout PCB: soldered 80-pin THT Edge Connector
         Socket near the top of the board, leaving generous open board space
         below for the student's through-hole parts (LED + resistor + buzzer). */
      doc = blank("micro:bit 小燈");
      doc.w = 76;
      doc.h = 56;
      doc.sig = 1;
      doc.sigTop = 1;
      var ub = addPart(doc, "ubit", 38.1, 43.18);
      var rs = addPart(doc, "res", 22.86, 13.97);
      rs.value = "330";
      var ld = addPart(doc, "led", 39.37, 13.97);
      var bz = addPart(doc, "buzz", 58.42, 15.24);
      connect(doc, ub.uid, "P0", rs.uid, "1");
      connect(doc, rs.uid, "2", ld.uid, "A");
      connect(doc, ld.uid, "K", ub.uid, "GND");
      connect(doc, ub.uid, "P1", bz.uid, "+");
      connect(doc, bz.uid, "-", ub.uid, "GND");
      doc.nets[0].name = "micro:bit P0";
      doc.nets[1].name = "燈的正極";
      doc.nets[2].name = "接地";
      doc.nets[3].name = "micro:bit P1";
      return doc;
    }
    if (id === "uno") {
      doc = blank("UNO 小燈");
      setOutline(doc, "uno");
      doc.w = 68.58;
      doc.h = 53.34;
      doc.sig = 1;
      doc.sigY = 41.2;
      var un = addPart(doc, "uno", 0, 0);
      un.x = 0;
      un.y = 0;
      var rs = addPart(doc, "res", 36.83, 24.13);
      rs.value = "220";
      var ld = addPart(doc, "led", 50.8, 24.13);
      connect(doc, un.uid, "D12", rs.uid, "1");
      connect(doc, rs.uid, "2", ld.uid, "A");
      connect(doc, ld.uid, "K", un.uid, "GND");
      doc.nets[0].name = "UNO D12";
      doc.nets[1].name = "燈的正極";
      doc.nets[2].name = "接地";
      return doc;
    }
    return blank("我的電路板");
  }

  function sanitize(doc) {
    /* drafts come from older builds or other hands: validate hard,
       drop what cannot be drawn, recompute what can */
    if (!doc || typeof doc !== "object") return null;
    if (!Array.isArray(doc.parts) || !Array.isArray(doc.nets)) return null;
    if ((!doc.version || doc.version < 2) && (doc.name === "micro:bit 小燈" || doc.name === "micro:bit Light")) {
      return template("ubit");
    }
    var out = blank(doc.name);
    out.w = Math.max(20, Math.min(100, r2(Number(doc.w) || 70)));
    out.h = Math.max(20, Math.min(100, r2(Number(doc.h) || 45)));
    out.mask = doc.mask === "black" || doc.mask === "white" ? doc.mask : "green";
    out.outline = doc.outline === "uno" ? "uno" : "rect";
    out.seq = Number(doc.seq) || 1;
    out.sig = doc.sig ? 1 : 0;
    out.sigTop = doc.sigTop ? 1 : 0;
    if (typeof doc.sigY === "number" && isFinite(doc.sigY)) out.sigY = r2(doc.sigY);
    if (doc.parts.some(function (p) { return p && p.type === "ubit"; })) {
      if (out.w < 68) out.w = 76;
      if (out.h < 50) out.h = 56;
    }
    var hasUno = doc.parts.some(function (p) { return p && p.type === "uno"; });
    if (hasUno) {
      out.outline = "uno";
      out.w = 68.58;
      out.h = 53.34;
      if (out.sigY == null || out.sigY > 43) out.sigY = 41.2;
    } else if (out.outline === "uno") {
      out.outline = "rect";
    }
    function fitsInOut(cand) {
      if (cand.type === "uno") return true;
      var bb = bodyBox(cand);
      if (bb.x < 0.5 || bb.y < 0.5 || bb.x + bb.w > out.w - 0.5 || bb.y + bb.h > out.h - 0.5) return false;
      var rA = partRects(cand);
      for (var i = 0; i < out.parts.length; i++) {
        var rB = partRects(out.parts[i]);
        for (var a = 0; a < rA.length; a++) {
          for (var b = 0; b < rB.length; b++) {
            if (boxesOverlap(rA[a], rB[b])) return false;
          }
        }
      }
      return true;
    }
    var alive = {};
    doc.parts.forEach(function (p) {
      if (!p || !p.uid || !partById(p.type)) return;
      alive[p.uid] = 1;
      var rot = [0, 90, 180, 270].indexOf(Number(p.rot)) >= 0 ? Number(p.rot) : 0;
      var px = p.type === "uno" ? 0 : snap(Number(p.x) || 0);
      var py = p.type === "uno" ? 0 : snap(Number(p.y) || 0);
      var cand = {
        uid: p.uid,
        type: p.type,
        x: px,
        y: py,
        rot: p.type === "uno" ? 0 : rot,
        ref: String(p.ref || "?"),
        value: String(p.value || "")
      };
      if (cand.type !== "uno") {
        var bb0 = bodyBox(cand);
        var hw = bb0.w / 2 + 0.8, hh = bb0.h / 2 + 0.8;
        cand.x = snap(Math.max(hw, Math.min(out.w - hw, cand.x)));
        cand.y = snap(Math.max(hh, Math.min(out.h - hh, cand.y)));
        if (!fitsInOut(cand)) {
          var placed = false;
          for (var rad = 1; rad <= 28 && !placed; rad++) {
            for (var dy = -rad; dy <= rad && !placed; dy++) {
              for (var dx = -rad; dx <= rad && !placed; dx++) {
                if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue;
                cand.x = snap(px + dx * 2.54);
                cand.y = snap(py + dy * 2.54);
                if (fitsInOut(cand)) placed = true;
              }
            }
          }
        }
      }
      out.parts.push(cand);
    });
    doc.nets.forEach(function (n) {
      if (!n || !Array.isArray(n.pins)) return;
      var net = { id: String(n.id), name: String(n.name || "線路"), pins: [] };
      n.pins.forEach(function (pin) {
        if (!pin || !alive[pin.uid]) return;
        var part = findPart(out, pin.uid);
        if (!part) return;
        var ok = partById(part.type).pads.some(function (pd) { return pd.id === pin.pad || pd.group === pin.pad; });
        if (!ok) return;
        net.pins.push({ uid: pin.uid, pad: pin.pad });
      });
      if (net.pins.length >= 2) out.nets.push(net);
    });
    if (!out.parts.length) return null;
    return out;
  }

  function clone(doc) { return JSON.parse(JSON.stringify(doc)); }

  return {
    CELL: CELL,
    TRACE: TRACE,
    CLEAR: CLEAR,
    VIA_DRILL: VIA_DRILL,
    VIA_PAD: VIA_PAD,
    PARTS: PARTS,
    partById: partById,
    blank: blank,
    template: template,
    addPart: addPart,
    findPart: findPart,
    worldPads: worldPads,
    bodyBox: bodyBox,
    siblings: siblings,
    connect: connect,
    removeNet: removeNet,
    disconnectPin: disconnectPin,
    removePart: removePart,
    rotatePart: rotatePart,
    movePart: movePart,
    setValue: setValue,
    renameNet: renameNet,
    setBoard: setBoard,
    setOutline: setOutline,
    outlineLoops: outlineLoops,
    groupsInNet: groupsInNet,
    netOf: netOf,
    partRects: partRects,
    simplifyPts: simplifyPts,
    route: route,
    check: check,
    sanitize: sanitize,
    exportZip: exportZip,
    clone: clone,
    snap: snap
  };
});
