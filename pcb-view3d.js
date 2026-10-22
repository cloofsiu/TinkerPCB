/* Smooth front-top drawing. Canvas paths, not a pixel buffer. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PCBView3D = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FRONT_YAW = 0.36;
  var FRONT_PITCH = 0.78;
  var T = 2.6;

  function rot90(x, y, k) {
    k = ((k % 4) + 4) % 4;
    if (k === 1) return [-y, x];
    if (k === 2) return [-x, -y];
    if (k === 3) return [y, -x];
    return [x, y];
  }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function mix(c, f) {
    return c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v * f))); });
  }

  function project(p, cam, doc, cx, cy) {
    var x = p[0] - doc.w / 2;
    var y = p[1] - doc.h / 2;
    var z = p[2];
    var cs = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
    var x1 = x * cs - y * sn;
    var y1 = x * sn + y * cs;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var y2 = y1 * cp - z * sp;
    var z2 = y1 * sp + z * cp;
    var depth = cam.dist - y2;
    var f = cam.focal / Math.max(8, depth);
    return { sx: cx + x1 * f, sy: cy - z2 * f, depth: depth };
  }

  function frame(doc, width, height, yaw, pitch) {
    var cam = {
      yaw: yaw == null ? FRONT_YAW : yaw,
      pitch: pitch == null ? FRONT_PITCH : pitch,
      dist: 90,
      focal: Math.max(320, Math.min(width, height) * 0.62)
    };
    var corners = [
      [0, 0, 0], [doc.w, 0, 0], [doc.w, doc.h, 0], [0, doc.h, 0],
      [0, 0, 12], [doc.w, 0, 12], [doc.w, doc.h, 12], [0, doc.h, 12]
    ];
    function inside(dist) {
      cam.dist = dist;
      var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (var i = 0; i < corners.length; i++) {
        var q = project(corners[i], cam, doc, width / 2, height / 2);
        if (q.sx < minx) minx = q.sx;
        if (q.sx > maxx) maxx = q.sx;
        if (q.sy < miny) miny = q.sy;
        if (q.sy > maxy) maxy = q.sy;
      }
      return minx > width * 0.08 && maxx < width * 0.92 && miny > height * 0.1 && maxy < height * 0.9;
    }
    var lo = 20, hi = 500;
    for (var n = 0; n < 22; n++) {
      var mid = (lo + hi) / 2;
      if (inside(mid)) hi = mid;
      else lo = mid;
    }
    cam.dist = hi;
    return cam;
  }

  function P(cam, doc, cx, cy, x, y, z) {
    return project([x, y, z], cam, doc, cx, cy);
  }

  function fill(ctx, pts, color) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    ctx.fillStyle = rgb(color);
    ctx.fill();
  }

  function boxFaces(cx, cy, z0, sx, sy, sz, color, k) {
    var hx = sx / 2, hy = sy / 2;
    var raw = [
      [-hx, -hy, z0], [hx, -hy, z0], [hx, hy, z0], [-hx, hy, z0],
      [-hx, -hy, z0 + sz], [hx, -hy, z0 + sz], [hx, hy, z0 + sz], [-hx, hy, z0 + sz]
    ];
    var w = raw.map(function (p) {
      var xy = rot90(p[0], p[1], k);
      return [cx + xy[0], cy + xy[1], p[2]];
    });
    function face(ids, f) {
      var pts = ids.map(function (i) { return w[i]; });
      var depth = 0;
      pts.forEach(function (p) { depth += p[2]; });
      return { pts: pts, color: mix(color, f), depth: -depth };
    }
    return [
      face([0, 1, 5, 4], 0.78),
      face([1, 2, 6, 5], 0.66),
      face([2, 3, 7, 6], 0.9),
      face([3, 0, 4, 7], 0.74),
      face([4, 5, 6, 7], 1.05)
    ];
  }

  function cyl(cx, cy, z0, z1, rad, color, n) {
    n = n || 18;
    var top = [], bot = [], faces = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      top.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z1]);
      bot.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z0]);
    }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var shade = 0.62 + 0.38 * (0.5 + 0.5 * Math.cos((i / n) * Math.PI * 2));
      faces.push({ pts: [bot[i], bot[j], top[j], top[i]], color: mix(color, shade), depth: -(z0 + z1) });
    }
    faces.push({ pts: top, color: mix(color, 1.08), depth: -z1 - 1 });
    return faces;
  }

  function drawFace(ctx, cam, doc, cx, cy, face) {
    fill(ctx, face.pts.map(function (p) { return P(cam, doc, cx, cy, p[0], p[1], p[2]); }), face.color);
  }

  function ledColor(part) {
    if (part.value === "綠") return [42, 176, 86];
    if (part.value === "琥珀") return [240, 150, 32];
    return [230, 52, 58];
  }

  function draw(ctx, width, height, doc, cam, PCB) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    var bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#f7f3ea");
    bg.addColorStop(1, "#e7e0d2");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    var cx = width / 2, cy = height * 0.54;
    var t = T;
    function pp(x, y, z) { return P(cam, doc, cx, cy, x, y, z); }

    var shadow = pp(doc.w / 2, doc.h / 2, -1);
    ctx.save();
    ctx.fillStyle = "rgba(40, 32, 24, 0.12)";
    ctx.beginPath();
    ctx.ellipse(shadow.sx, shadow.sy + 18, width * 0.22, height * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var side = [214, 168, 108];
    var top = [42, 176, 104];
    if (doc.mask === "black") top = [42, 46, 54];
    if (doc.mask === "white") top = [236, 232, 220];
    var sides = [
      { pts: [[0, 0, 0], [doc.w, 0, 0], [doc.w, 0, t], [0, 0, t]], color: mix(side, 1), depth: 0 },
      { pts: [[doc.w, 0, 0], [doc.w, doc.h, 0], [doc.w, doc.h, t], [doc.w, 0, t]], color: mix(side, 0.82), depth: -doc.h },
      { pts: [[doc.w, doc.h, 0], [0, doc.h, 0], [0, doc.h, t], [doc.w, doc.h, t]], color: mix(side, 0.7), depth: -doc.h * 2 },
      { pts: [[0, doc.h, 0], [0, 0, 0], [0, 0, t], [0, doc.h, t]], color: mix(side, 0.9), depth: -doc.h }
    ];
    sides.sort(function (a, b) { return a.depth - b.depth; });
    sides.forEach(function (f) { drawFace(ctx, cam, doc, cx, cy, f); });
    fill(ctx, [
      pp(0, 0, t), pp(doc.w, 0, t), pp(doc.w, doc.h, t), pp(0, doc.h, t)
    ], top);

    var sample = pp(10, 10, t);
    var sample2 = pp(11, 10, t);
    var pxmm = Math.max(1.5, Math.hypot(sample2.sx - sample.sx, sample2.sy - sample.sy));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#f0c14a";
    ctx.lineWidth = Math.max(2.5, pxmm * 1.05);
    (doc.routes || []).forEach(function (r) {
      (r.segs || []).forEach(function (seg) {
        if (seg.layer !== 0 || !seg.pts || seg.pts.length < 2) return;
        ctx.beginPath();
        seg.pts.forEach(function (pt, i) {
          var q = pp(pt[0], pt[1], t + 0.15);
          if (i === 0) ctx.moveTo(q.sx, q.sy);
          else ctx.lineTo(q.sx, q.sy);
        });
        ctx.stroke();
      });
    });

    if (PCB) {
      doc.parts.forEach(function (part) {
        PCB.worldPads(part).forEach(function (pad) {
          var c = pp(pad.x, pad.y, t + 0.2);
          if (pad.shape === "rect") {
            fill(ctx, [
              pp(pad.x - pad.w / 2, pad.y - pad.h / 2, t + 0.2),
              pp(pad.x + pad.w / 2, pad.y - pad.h / 2, t + 0.2),
              pp(pad.x + pad.w / 2, pad.y + pad.h / 2, t + 0.2),
              pp(pad.x - pad.w / 2, pad.y + pad.h / 2, t + 0.2)
            ], [240, 193, 74]);
            return;
          }
          var rr = Math.max(3, (pad.dia / 2) * pxmm);
          ctx.beginPath();
          ctx.arc(c.sx, c.sy, rr, 0, Math.PI * 2);
          ctx.fillStyle = "#f0c14a";
          ctx.fill();
          if (!pad.drill) return;
          ctx.beginPath();
          ctx.arc(c.sx, c.sy, Math.max(1.5, (pad.drill / 2) * pxmm), 0, Math.PI * 2);
          ctx.fillStyle = "#1c2420";
          ctx.fill();
        });
      });
    }

    var bodies = [];
    doc.parts.forEach(function (part) {
      var k = (part.rot / 90) | 0;
      var faces = [];
      if (part.type === "led") {
        var col = ledColor(part);
        faces = cyl(part.x, part.y, t + 1.4, t + 8.2, 2.55, col, 20)
          .concat(cyl(part.x, part.y, t + 8.2, t + 9.2, 1.55, mix(col, 1.15), 14));
        [-1.27, 1.27].forEach(function (lx) {
          var lp = rot90(lx, 0, k);
          faces = faces.concat(cyl(part.x + lp[0], part.y + lp[1], t + 0.2, t + 1.55, 0.28, [240, 193, 74], 6));
        });
      } else if (part.type === "res") {
        faces = boxFaces(part.x, part.y, t + 2.6, 7.4, 2.5, 2.5, [236, 198, 138], k)
          .concat(boxFaces(part.x, part.y, t + 2.75, 1.15, 2.65, 2.2, [204, 52, 46], k))
          .concat(boxFaces(part.x, part.y, t + 2.75, 0.7, 2.65, 2.2, [70, 64, 176], k));
        [-5.08, 5.08].forEach(function (lx) {
          var lp = rot90(lx, 0, k);
          faces = faces.concat(cyl(part.x + lp[0], part.y + lp[1], t + 0.2, t + 2.7, 0.28, [240, 193, 74], 6));
        });
      } else if (part.type === "sw") {
        faces = boxFaces(part.x, part.y, t, 6.4, 6.4, 3.1, [46, 50, 58], k)
          .concat(cyl(part.x, part.y, t + 3.1, t + 5.6, 2.15, [58, 132, 232], 18));
      } else if (part.type === "buzz") {
        faces = cyl(part.x, part.y, t, t + 5.8, 5.5, [40, 44, 52], 22)
          .concat(cyl(part.x, part.y, t + 5.8, t + 6.15, 2.3, [240, 176, 48], 14));
      } else if (part.type === "bat") {
        faces = boxFaces(part.x, part.y, t, 16.5, 11, 3.4, [176, 184, 192], k)
          .concat(cyl(part.x, part.y, t + 3.4, t + 4.15, 5.8, [214, 168, 52], 18));
      } else if (part.type === "ubit") {
        var sc = rot90(0, 21, k);
        faces = boxFaces(part.x + sc[0], part.y + sc[1], t + 0.25, 51.6, 42, 1.9, [36, 72, 116], k);
        var bc = rot90(0, 0.6, k);
        faces = faces.concat(boxFaces(part.x + bc[0], part.y + bc[1], t + 0.25, 51.6, 1.2, 1.98, [240, 193, 74], k));
        for (var mx = -2; mx <= 2; mx++) {
          for (var my = 0; my < 5; my++) {
            var dp = rot90(mx * 4, 17 + my * 4, k);
            faces = faces.concat(cyl(part.x + dp[0], part.y + dp[1], t + 2.15, t + 2.35, 1.05, [255, 214, 64], 8));
          }
        }
      } else if (part.type === "uno") {
        function lp(lx, ly) {
          var r = rot90(lx, ly, k);
          return [part.x + r[0], part.y + r[1]];
        }
        var hp = lp(36.83, 2.54);
        faces = boxFaces(hp[0], hp[1], t, 19.78, 2.4, 8.8, [34, 38, 46], k);
        var ap = lp(57.15, 2.54);
        faces = faces.concat(boxFaces(ap[0], ap[1], t, 14.7, 2.4, 8.8, [34, 38, 46], k));
        var d10 = lp(30.226, 50.8);
        faces = faces.concat(boxFaces(d10[0], d10[1], t, 24.86, 2.4, 8.8, [34, 38, 46], k));
        var d8 = lp(54.61, 50.8);
        faces = faces.concat(boxFaces(d8[0], d8[1], t, 19.78, 2.4, 8.8, [34, 38, 46], k));
        var ic = lp(64.9, 27.94);
        faces = faces.concat(boxFaces(ic[0], ic[1], t, 4.7, 7.2, 8.8, [34, 38, 46], k));
        var uc = lp(34.29, 26.67);
        faces = faces.concat(boxFaces(uc[0], uc[1], t + 8.8, 68.58, 53.34, 1.7, [0, 118, 138], k));
        var us = lp(3.5, 38);
        faces = faces.concat(boxFaces(us[0], us[1], t + 10.5, 8, 7, 2.6, [196, 200, 206], k));
        var bj = lp(4.5, 8);
        faces = faces.concat(boxFaces(bj[0], bj[1], t + 10.5, 9, 7, 3.2, [30, 30, 32], k));
      } else if (part.type === "hdr3" || part.type === "hdr4") {
        var n = part.type === "hdr3" ? 3 : 4;
        faces = boxFaces(part.x, part.y, t + 1.6, 2.6, n * 2.54, 2.8, [32, 36, 44], k);
      }
      var depth = 0;
      faces.forEach(function (f) { depth += f.depth; });
      bodies.push({ faces: faces, depth: faces.length ? depth / faces.length : 0 });
    });
    bodies.sort(function (a, b) { return a.depth - b.depth; });
    bodies.forEach(function (body) {
      body.faces.sort(function (a, b) { return a.depth - b.depth; });
      body.faces.forEach(function (f) { drawFace(ctx, cam, doc, cx, cy, f); });
    });
  }

  return {
    draw: draw,
    frame: frame,
    camera: frame,
    frontYaw: FRONT_YAW,
    frontPitch: FRONT_PITCH
  };
});
