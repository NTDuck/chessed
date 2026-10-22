import puppeteer from "puppeteer";

const URL = "http://localhost:4173/chessed/";
const results = [];
const ok = (n, p, d) => results.push({ name: n, pass: p, detail: d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pump = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        let c = 0;
        const t = () => { c++; if (c > 30) res(); else requestAnimationFrame(t); };
        requestAnimationFrame(t);
      }),
  );

const CHROME = "/home/ayin/projs/chessed/scripts/chrome-libwrapper.sh"; // LD_LIBRARY_PATH wrapper for headless chrome

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const consoleLog = [];
  const pageErrors = [];
  page.on("console", (m) => consoleLog.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
  await pump(page);

  // ---- geometry helpers (in-page) ---------------------------------------
  const SQ = (sq, flipped) =>
    page.evaluate(
      ([sq, fl]) => {
        const svg = document.querySelector("svg.board");
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const cell = (Math.min(r.width, r.height) - 20) / 8;
        const dc = sq % 8, dr = Math.floor(sq / 8);
        const fdc = fl ? 7 - dc : dc, fdr = fl ? 7 - dr : dr;
        return { x: r.left + 10 + (fdc + 0.5) * cell, y: r.top + 10 + (fdr + 0.5) * cell };
      },
      [sq, flipped],
    );

  const fire = (page, x, y, type) =>
    page.evaluate(
      ({ x, y, type }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, view: window }));
        return true;
      },
      { x, y, type },
    );
  const click = async (page, x, y) => {
    await fire(page, x, y, "pointerdown");
    await pump(page);
    await fire(page, x, y, "pointerup");
    await pump(page);
  };
  const textOf = (sel) =>
    page.evaluate((s) => {
      const e = document.querySelector(s);
      return e ? e.textContent.trim() : null;
    }, sel);

  const isMyTurn = () =>
    page.evaluate(() => {
      const s = document.querySelector(".stext");
      return s ? /Your move|You play/.test(s.textContent) : false;
    });

  const waitForMyTurn = async (page, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      if (await isMyTurn()) return true;
      await pump(page);
      await sleep(40);
    }
    return false;
  };

  const play = async (from, to, tries = 6) => {
    for (let a = 0; a < tries; a++) {
      if (!(await waitForMyTurn(page, 8))) continue;
      const a0 = await SQ(from);
      const b0 = await SQ(to);
      if (!a0 || !b0) return false;
      await fire(page, a0.x, a0.y, "pointerdown");
      await sleep(30);
      await fire(page, b0.x, b0.y, "pointermove");
      await sleep(30);
      await fire(page, b0.x, b0.y, "pointerup");
      await pump(page);
      await sleep(60);
      return true;
    }
    return false;
  };

  // ---- 0. title / icon / no description --------------------------------
  const title = await page.title();
  const iconHref = await page.evaluate(() => document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? null);
  const desc = await page.evaluate(() => {
    const h = document.querySelector("header .status .stext")?.textContent ?? "";
    return h;
  });
  ok("title+icon/no-description", title === "chessed" && iconHref !== null && !desc.toLowerCase().includes("play chess"), `title=${title} icon=${iconHref}`);

  // ---- 1. board fills page height --------------------------------------
  const boardBox = await page.evaluate(() => {
    const svg = document.querySelector("svg.board");
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  const fillH = boardBox && boardBox.h >= boardBox.vh - 100;
  ok("board-full-height", !!fillH, `board ${boardBox?.w}x${boardBox?.h} in vh ${boardBox?.vh}, top ${boardBox?.top} bottom ${boardBox?.bottom}`);

  // ---- font check: @font-face present + computed font of .app root --------
  const fontInfo = await page.evaluate(async () => {
    await document.fonts.ready;
    // (a) collect @font-face rules declared in any stylesheet
    const faces = [];
    for (const sh of document.styleSheets) {
      let rules;
      try { rules = sh.cssRules; } catch { continue; }
      for (const r of rules) if (r.type === CSSRule.FONT_FACE_RULE) faces.push(r.style.fontFamily);
    }
    // (b) computed font-family of the .app element
    const t = document.querySelector(".app");
    const family = t ? getComputedStyle(t).fontFamily : "";
    const loaded = [];
    for (const f of document.fonts) if (f.status === "loaded") loaded.push(f.family);
    return { family, faces, loaded };
  });
  const hasFace = fontInfo.faces.some((f) => /Amazon Ember/i.test(f));
  const startsWithEmber = (() => {
    let s = fontInfo.family.trim();
    if (s[0] === '"' || s[0] === "'") s = s.slice(1);
    return s.toLowerCase().startsWith("amazon ember");
  })();
  ok("amazon-ember-webfont", hasFace && startsWithEmber, `@font-face=[${fontInfo.faces.join(",")}] .app font-family="${fontInfo.family}" startsWithEmber=${startsWithEmber} loaded=[${fontInfo.loaded.join(",")}]`);

  // ---- animation doctrine: pixelated steps() set + one eval transition ----
  const animInfo = await page.evaluate(() => {
    const trans = new Set(), anims = new Set();
    for (const sh of document.styleSheets) {
      let rules;
      try { rules = sh.cssRules; } catch { continue; }
      for (const r of rules) {
        if (r.type === CSSRule.STYLE_RULE) {
          if (r.style && r.style.transition && r.style.transition !== "none") trans.add(r.style.transition);
          if (r.style && r.style.animationName) anims.add(r.style.animationName);
        }
      }
    }
    return { transitions: [...trans], animations: [...anims] };
  });
  const ALLOWED_ANIMS = ["popin", "piemove", "capdissolve", "chkpulse", "dotpulse", "lmflash", "tokpop"];
  const animSetOk = animInfo.animations.length === ALLOWED_ANIMS.length
    && animInfo.animations.every((a) => ALLOWED_ANIMS.includes(a))
    && ALLOWED_ANIMS.every((a) => animInfo.animations.includes(a));
  const transOk = animInfo.transitions.length === 1
    && /height/.test(animInfo.transitions[0])
    && /steps\(\s*6\s*\)/.test(animInfo.transitions[0]);
  ok("pixel-animations-doctrine", animSetOk && transOk, `transitions=[${animInfo.transitions}] animations=[${animInfo.animations}]`);

  // ---- 2. icon-only controls + custom tooltip --------------------------
  const iconInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".ibtn")];
    const allIconOnly = btns.length === 5 && btns.every((b) => {
      const c = b.cloneNode(true);
      c.querySelectorAll(".tip").forEach((t) => t.remove());
      return (c.textContent ?? "").trim() === "";
    });
    const tips = btns.map((b) => b.querySelector(".tip")?.textContent ?? null);
    return { count: btns.length, allIconOnly, tips };
  });
  // hover first button to confirm tip becomes visible (opacity 1)
  const btn0 = await page.evaluate(() => {
    const b = document.querySelector(".ibtn");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  let tipVisible = false;
  if (btn0) {
    await page.mouse.move(btn0.x, btn0.y);
    await sleep(60);
    tipVisible = await page.evaluate(() => {
      const b = document.querySelector(".ibtn");
      const tip = b?.querySelector(".tip");
      return tip ? getComputedStyle(tip).opacity === "1" : false;
    });
  }
  ok("icon-controls+tooltip", iconInfo.allIconOnly && iconInfo.tips.every((t) => t && t.length > 0) && tipVisible, `count=${iconInfo.count} iconOnly=${iconInfo.allIconOnly} tips=${JSON.stringify(iconInfo.tips)} hoverVisible=${tipVisible}`);

  // ---- border titles: tuistore border-title labels are present -----------
  const titleInfo = await page.evaluate(() => {
    const ts = [...document.querySelectorAll(".ptitle")];
    return {
      count: ts.length,
      allNonEmpty: ts.every((t) => (t.textContent ?? "").trim().length > 0),
      labels: ts.map((t) => (t.textContent ?? "").trim()),
    };
  });
  ok("border-titles-present", titleInfo.count >= 5 && titleInfo.allNonEmpty, `ptitles=${titleInfo.count} labels=${JSON.stringify(titleInfo.labels)} nonEmpty=${titleInfo.allNonEmpty}`);

  // ---- eval bar: left vertical bar + chip --------------------------------
  const evalBar = await page.evaluate(() => {
    const bar = document.querySelector(".evalbar[data-evalbar]");
    if (!bar) return null;
    const fill = document.querySelector(".eval-fill");
    const chip = document.querySelector(".eval-chip");
    let pct = null;
    if (fill) {
      const m = (fill.style.height ?? "").match(/^([\d.]+)%$/);
      if (m) pct = parseFloat(m[1]);
    }
    return {
      hasFill: !!fill,
      pct,
      chipText: chip ? chip.textContent.trim() : null,
    };
  });
  const barOk = !!evalBar && evalBar.hasFill
    && evalBar.pct !== null && evalBar.pct >= 2 && evalBar.pct <= 98
    && !!evalBar.chipText && /^([+-]?\d+\.\d|M)$/.test(evalBar.chipText);
  ok("eval-bar", barOk, `fillPct=${evalBar?.pct} chip="${evalBar?.chipText}"`);

  // ---- 3. ELO slider -----------------------------------------------------
  const eloInfo = await page.evaluate(() => {
    const slider = document.querySelector("input[data-elo-slider]");
    if (!slider) return null;
    const ticks = [...document.querySelectorAll(".elo-tick")];
    return {
      min: slider.getAttribute("min"),
      max: slider.getAttribute("max"),
      step: slider.getAttribute("step"),
      labels: ticks.map((t) => t.textContent.trim()),
      onCount: ticks.filter((t) => t.classList.contains("on")).length,
    };
  });
  const wantLabels = ["300", "700", "1100", "1500", "1900"];
  const labelsOk = eloInfo && JSON.stringify(eloInfo.labels) === JSON.stringify(wantLabels);
  const attrsOk = !!eloInfo && eloInfo.min === "0" && eloInfo.max === "4" && eloInfo.step === "1";
  // drive slider to 1900 (value 4) and confirm live display + active tick
  let driven = false;
  try {
    await page.evaluate(() => {
      const slider = document.querySelector("input[data-elo-slider]");
      slider.value = "4";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await pump(page);
    driven = await page.evaluate(() => {
      const val = document.querySelector(".elo-value")?.textContent.trim() ?? "";
      const tick = [...document.querySelectorAll(".elo-tick")].find((t) => t.textContent.trim() === "1900");
      return val === "1900" && !!tick && tick.classList.contains("on");
    });
  } catch { /* slider absent */ }
  ok("elo-slider", attrsOk && labelsOk && eloInfo?.onCount === 1 && driven, `labels=${JSON.stringify(eloInfo?.labels)} onCount=${eloInfo?.onCount} driven1900=${driven}`);

  // ---- 4. horizontal move list -----------------------------------------
  const movesBefore = await page.evaluate(() => document.querySelectorAll(".mtok").length);
  const played = await play(12, 28); // e4
  const botMoved = await waitForMyTurn(page, 30);
  const played2 = await play(6, 21); // Nf3 (g1 knight -> f3)
  const botMoved2 = await waitForMyTurn(page, 30);
  const played3 = await play(1, 18); // Nc3 (b1 knight -> c3)
  const botMoved3 = await waitForMyTurn(page, 30);
  const moveData = await page.evaluate(() => {
    const toks = [...document.querySelectorAll(".mtok")].map((t) => {
      const r = t.getBoundingClientRect();
      return { san: t.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top) };
    });
    // move list is a pair-grid: each .mrow is a horizontal row of tokens
    const rows = [...document.querySelectorAll(".mrow")].map((row) =>
      [...row.querySelectorAll(".mtok")].map((t) => {
        const r = t.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top) };
      }),
    );
    return { toks, rows };
  });
  const grew = moveData.toks.length > movesBefore;
  // horizontal: within each row, tokens share ~y and increase in x (left-to-right)
  let horizontal = false;
  if (moveData.toks.length >= 3 && moveData.rows.length >= 1) {
    horizontal = moveData.rows.every((row) => {
      if (row.length === 0) return true;
      const sameY = row.every((c) => Math.abs(c.y - row[0].y) <= 4);
      const incX = row.every((c, i) => i === 0 || c.x > row[i - 1].x - 2);
      return sameY && incX;
    });
  }
  ok("horizontal-moves", grew && horizontal, `toks=${moveData.toks.length} (was ${movesBefore}) rows=${moveData.rows.length} horizontal=${horizontal}`);

  // ---- move quality symbols ----------------------------------------------
  const msymInfo = await page.evaluate(() => {
    const toks = [...document.querySelectorAll(".mtok")];
    const allHaveSym = toks.length > 0 && toks.every((t) => {
      const s = t.querySelector(".msym");
      return s && s.textContent.trim().length > 0;
    });
    const verdict = document.querySelector(".verdict[data-verdict]");
    return {
      toks: toks.length,
      allHaveSym,
      verdictText: verdict ? verdict.textContent.trim() : null,
    };
  });
  ok("move-quality-symbols", msymInfo.allHaveSym && !!msymInfo.verdictText, `toks=${msymInfo.toks} allHaveMsym=${msymInfo.allHaveSym} verdict="${msymInfo.verdictText}"`);

  // ---- 5. laya choices panel -------------------------------------------
  const choices = await page.evaluate(() => [...document.querySelectorAll(".crow")].map((r) => ({ san: r.querySelector(".csan")?.textContent.trim(), score: r.querySelector(".cscore")?.textContent.trim() })));
  const hasChoices = choices.length > 0 && choices.length <= 8;
  const fmtOk = choices.every((c) => /[A-Za-z0-9]/.test(c.san ?? "") && /-?\d/.test(c.score ?? ""));
  ok("laya-choices-panel", hasChoices && fmtOk, `n=${choices.length} first=${JSON.stringify(choices[0] ?? null)}`);

  // ---- 7. drag ghost ----------------------------------------------------
  const gh = await (async () => {
    if (!(await waitForMyTurn(page, 30))) return { during: false, after: true, reason: "not my turn" };
    // drag from a square that currently has a piece (hardcoded squares go stale)
    const a = await page.evaluate(() => {
      const g = document.querySelector("svg.board g[data-square]");
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    if (!a) return { during: false, after: true, reason: "no piece" };
    await fire(page, a.x, a.y, "pointerdown");
    await sleep(30);
    // drag ~20px (well over the 4px threshold), staying on the board
    const midX = a.x + 20, midY = a.y + 20;
    await fire(page, midX, midY, "pointermove");
    await sleep(30);
    await pump(page);
    const during = await page.evaluate(() => !!document.querySelector(".ghost"));
    await fire(page, midX, midY, "pointerup");
    await pump(page);
    const after = await page.evaluate(() => !!document.querySelector(".ghost"));
    return { during, after };
  })();
  ok("drag-ghost", gh.during === true && gh.after === false, `during=${gh.during} afterDrop=${gh.after} ${gh.reason ?? ""}`);

  // ---- screenshot -------------------------------------------------------
  await page.screenshot({ path: "/home/ayin/projs/chessed/shot.png", fullPage: false });

  // ---- console summary --------------------------------------------------
  const errLines = consoleLog.filter((l) => l.startsWith("error"));
  ok("no-console-errors", errLines.length === 0 && pageErrors.length === 0, `errors=${JSON.stringify(errLines)} pageErrors=${JSON.stringify(pageErrors)}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ results, }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) console.log("FAILED:", failed.map((f) => f.name).join(", "));
