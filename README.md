# TinkerPCB

**Your first PCB creator · 你的第一個電路板創作器**

[**Live Demo → cloofsiu.github.io/TinkerPCB**](https://cloofsiu.github.io/TinkerPCB/) · [**English Demo (`?lang=en`)**](https://cloofsiu.github.io/TinkerPCB/?lang=en)

![TinkerPCB micro:bit 3D View](preview/ubit_3d.png)

**TinkerPCB** is a zero-install, single-lesson PCB design tool created for primary and junior-secondary STEM classrooms. Instead of overwhelming beginners with schematic capture, footprint assignment, and complex CAD menus, students go from a blank board to a real, manufacturable 2-layer PCB in four steps:

1. **Drag a part** onto the green board.
2. **Tap two gold pads** to connect them — the built-in 2-layer auto-router routes the copper traces automatically.
3. **Inspect in 3D** — orbit smoothly with WebGL (Three.js), flip underneath to inspect bottom-layer copper traces, and preview docked boards.
4. **Download the factory `.zip`** — exports standard Gerber (`RS-274X`) and Excellon drill files ready for 2-layer PCB fabrication (e.g. JLCPCB standard process).

| Arduino UNO Shield (3D Stack) | Arduino UNO Shield (2D Layout) |
| :---: | :---: |
| ![UNO 3D View](preview/uno_3d.png) | ![UNO 2D View](preview/uno_2d.png) |

---

## Classroom-First Features

- **15 Hand-Solder Through-Hole (THT) Parts Library**
  - **5mm LED** (`Red` / `Amber` / `Green` / `Blue` / `White`, round Anode `A` + square Cathode `K` with flat lens mark), **1/4W Axial Resistor** (`220Ω`, `330Ω`, `470Ω`, `1kΩ`, `4.7kΩ`, `10kΩ` with real 4-band EIA colour codes), **GL5528 Light Sensor (LDR)**, **6×6mm Tactile Pushbutton** (internal pin-pair continuity modelled automatically), **SS-12D00 Slide Switch**, **Potentiometer (`10kΩ` / `100kΩ`)**, **Radial Capacitor (`100nF` / `10µF` / `100µF`)**, **12mm Buzzer (`TMB12A05`)**, **CR2032 Coin-Cell Holder (`BS-7` / `Keystone 106`, `20.32mm` pitch)**, **G·V·S 3-Pin Servo/Sensor Header**, **1×3 & 1×4 2.54mm Pin Headers**, and **M3 Mounting Holes**.
- **BBC micro:bit THT Edge Connector Socket**
  - Uses the standard **BBC micro:bit 80-Pin THT Edge Connector Socket** (`4UCON 17809` / `Kitronik 5604` housing `56.8 × 8.8mm` with central card slot and 2 locating posts), breaking out all 21 active micro:bit V2 signals (`P0`, `P1`, `P2`, `3V`, `GND` main rings + `P3`–`P20` GPIOs) onto staggered hand-solderable THT pads.
  - Students solder the socket onto the PCB and plug the micro:bit upright into the slot — shown accurately in both the 2D footprint and 3D WebGL view.
- **Arduino UNO R3 Shield Mode**
  - Dropping the Arduino UNO socket automatically transforms the board outline and mounting holes into the official Arduino UNO R3 shield profile (`68.58 × 53.34mm`), complete with Power, Analog, Digital, and ICSP headers.
- **2-Layer Auto-Router & Design Rule Check (DRC)**
  - `0.50mm` grid Dijkstra router with `0.30mm` trace width, `0.20mm` clearance, and `0.60mm / 1.10mm` vias.
  - Real-time DRC checks for out-of-bounds parts, footprint overlaps, pad-to-pad clearance, and unrouted nets (with dashed ratsnest airwires).
- **Bilingual Interface (`繁體中文` / `English`)**
  - Toggle between Traditional Chinese and English anytime, or link directly with `?lang=en`.
  - URL parameters for classroom templates: `?tpl=led`, `?tpl=header`, `?tpl=ubit`, `?tpl=uno`, `?tpl=blank`, and `?mode=flat`.

---

## Running Locally & Testing

No build step or server required — open `index.html` directly in any modern browser, or serve the folder statically:

```bash
# Run engine & Gerber export test suite
node test-pcb.js
```

---

## 課堂簡介（繁體中文）

**TinkerPCB** 專為中小學 STEM 課堂而設，讓學生在一節課內完成人生第一塊真正可以落廠生產的雙層印刷電路板（PCB）：

1. **拖圖上板**：內置 15 款常用直插（THT）教學零件（5mm LED、四色環軸向電阻、GL5528 光敏電阻、6×6 輕觸按鈕、SS-12D00 撥動開關、可調電阻、電容、12mm 蜂鳴器、CR2032 電池座、G·V·S 舵機／感測器三針座、排針及 M3 螺絲孔），全部採用真實手焊腳距、方盤極性標示與防呆絲印。
2. **點兩個腳接線**：內置雙層自動走線引擎（線寬 `0.30mm`、間距 `0.20mm`、過孔鑽孔 `0.60mm`），自動處理頂層／底層走線與過孔。
3. **立體與平面檢視**：支援 Three.js WebGL 立體預覽，可順滑旋轉並翻到板底檢視底層銅線；無 WebGL 環境亦會自動切換至後備渲染器。
4. **micro:bit 插卡母座與 Arduino UNO Shield**：
   - **micro:bit 插座**：採用標準 BBC micro:bit 專用直插母座封裝（`4UCON 17809` / `Kitronik 5604`，雙排交錯 THT 焊盤引出 21 個有效訊號腳與定位柱），焊接母座後即可將 micro:bit 垂直插落卡槽。
   - **Arduino UNO 插座**：自動將電路板外框轉換為官方 R3 Shield 尺寸與腳位。
5. **一鍵匯出製板檔**：直接下載包含頂底銅層、阻焊層、絲印層、板邊及鑽孔檔的 `.zip`，可直接上傳至 JLCPCB 等板廠預覽及製作。

---

## Author & License

Designed and built by **Cloof Siu (蕭振平)** · [cv.cloofsiu.com](https://cv.cloofsiu.com) · [Instagram @cloofsiu](https://www.instagram.com/cloofsiu/) · [GitHub @cloofsiu](https://github.com/cloofsiu)

Released under the [MIT License](LICENSE).
