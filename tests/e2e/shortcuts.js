// Every keyboard shortcut in src/editor/shortcuts.ts, pressed for real, checked against the editor's state.
// Run by scripts/e2e.mjs (npm run e2e), which fills in the server address and the seeded project id. Each result's name starts
// with the command id, and the runner fails any command that has keys but no test here.
async (page) => {
  const STUDIO = "__STUDIO__";
  const ID = "__ID__";
  const results = [];
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: STUDIO });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${STUDIO}/p/${ID}`);
  await page.waitForFunction(() => !!globalThis.__studio?.getState().history);
  await page.waitForTimeout(800);

  const S = () =>
    page.evaluate(() => {
      const s = globalThis.__studio.getState();
      const d = s.history.doc;
      return {
        selection: s.selection,
        bp: s.bp,
        camera: s.camera,
        tool: s.tool,
        leftTab: s.leftTab,
        renaming: s.renaming,
        palette: s.palette,
        sheet: s.sheet,
        settings: s.settings,
        rulers: s.rulers,
        columns: s.columns,
        textEdit: s.textEdit,
        version: s.version,
        savedVersion: s.savedVersion,
        sections: d.page.sections.map((x) => ({ id: x.id, json: JSON.stringify(x.blocks), blocks: x.blocks.map((b) => ({ id: b.id, text: b.text ?? "", json: JSON.stringify(b) })) })),
      };
    });
  const blur = () => page.evaluate(() => document.activeElement?.blur?.());
  const sel = async (ids) => {
    await blur();
    await page.evaluate((ids) => globalThis.__studio.setState({ selection: ids }), ids);
  };
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  };
  const ok = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const test = async (name, fn) => {
    try {
      const note = await fn();
      results.push({ name, ok: true, note: typeof note === "string" ? note : "" });
    } catch (e) {
      results.push({ name, ok: false, note: String(e?.message ?? e).slice(0, 240) });
    }
  };

  const start = await S();
  const [first, free] = start.sections;
  const [alpha, one, beta] = first.blocks;
  const count = async (i = 0) => (await S()).sections[i].blocks.length;
  const blockJson = async (id) => (await S()).sections.flatMap((s) => s.blocks).find((b) => b.id === id)?.json;

  /* Edit */
  await test("edit.delete: Delete and Backspace remove the block", async () => {
    await sel([one.id]);
    await key("Delete");
    ok((await count()) === 3, "Delete didn't remove it");
    await key("Control+z");
    await sel([one.id]);
    await key("Backspace");
    ok((await count()) === 3, "Backspace didn't remove it");
    await key("Control+z");
  });
  await test("edit.undo: Ctrl+Z brings it back", async () => {
    await sel([one.id]);
    await key("Delete");
    await key("Control+z");
    ok((await count()) === 4, "not restored");
  });
  await test("edit.redo: Ctrl+Shift+Z and Ctrl+Y redo", async () => {
    await sel([one.id]);
    await key("Delete");
    await key("Control+z");
    await key("Control+Shift+z");
    ok((await count()) === 3, "Ctrl+Shift+Z didn't redo");
    await key("Control+z");
    await key("Control+y");
    ok((await count()) === 3, "Ctrl+Y didn't redo");
    await key("Control+z");
    ok((await count()) === 4, "couldn't undo back");
  });
  await test("edit.duplicate: Ctrl+D", async () => {
    await sel([alpha.id]);
    await key("Control+d");
    ok((await count()) === 5, "no copy");
    await key("Control+z");
  });
  await test("edit.copy: Ctrl+C then Ctrl+V pastes a copy", async () => {
    await sel([alpha.id]);
    await key("Control+c");
    await key("Control+v");
    await page.waitForTimeout(300);
    ok((await count()) === 5, "nothing pasted");
    await key("Control+z");
  });
  await test("edit.paste: Ctrl+V pastes what was cut", async () => {
    await sel([beta.id]);
    await key("Control+x");
    ok((await count()) === 3, "Ctrl+X didn't remove it");
    await sel([alpha.id]);
    await key("Control+v");
    await page.waitForTimeout(300);
    ok((await count()) === 4, "Ctrl+V didn't paste it back");
    await key("Control+z");
    await key("Control+z");
    ok((await S()).sections[0].json === first.json, "undo didn't restore the section");
  });
  await test("edit.cut: Ctrl+X removes and keeps it to paste", async () => {
    await sel([one.id]);
    await key("Control+x");
    ok((await count()) === 3, "not removed");
    await key("Control+z");
    ok((await count()) === 4, "not restored");
  });
  await test("edit.rename: Ctrl+R renames in Layers", async () => {
    await sel([first.id]);
    await key("Control+r");
    const s = await S();
    ok(s.renaming === first.id && s.leftTab === "layers", `renaming ${s.renaming}`);
    await key("Escape");
    ok((await S()).renaming === null, "Escape didn't cancel");
  });
  await test("edit.lock: Ctrl+L locks and unlocks", async () => {
    await sel([beta.id]);
    await key("Control+l");
    ok(/"locked":true/.test(await blockJson(beta.id)), "not locked");
    await sel([beta.id]);
    await key("Control+l");
    ok(!/"locked":true/.test(await blockJson(beta.id)), "not unlocked");
  });
  await test("edit.hide: Ctrl+; hides and shows", async () => {
    const before = await blockJson(beta.id);
    await sel([beta.id]);
    await key("Control+Semicolon");
    const hidden = await blockJson(beta.id);
    ok(hidden !== before && /hidden/.test(hidden), "not hidden");
    await sel([beta.id]);
    await key("Control+Semicolon");
    ok((await blockJson(beta.id)) !== hidden, "not shown again");
  });
  await test("edit.save: Ctrl+S saves now", async () => {
    await sel([alpha.id]);
    await key("Control+d");
    await key("Control+s");
    await page.waitForTimeout(800);
    const s = await S();
    ok(s.savedVersion === s.version, `saved ${s.savedVersion} of ${s.version}`);
    const saved = await (await page.request.get(`${STUDIO}/api/projects/${ID}`)).json();
    ok(saved.page.sections[0].blocks.length === 5, "the server doesn't have it");
    await key("Control+z");
    await key("Control+s");
  });
  await test("edit.preview: Ctrl+P opens the preview", async () => {
    await blur();
    const [popup] = await Promise.all([page.context().waitForEvent("page", { timeout: 5000 }), key("Control+p")]);
    const url = popup.url();
    await popup.close();
    ok(url.includes(`/preview/${ID}`), url);
  });
  await test("edit.text: Enter edits a heading's words", async () => {
    await sel([alpha.id]);
    await key("Enter");
    ok((await S()).textEdit?.id === alpha.id, "not editing");
    await key("Escape");
    ok(!(await S()).textEdit, "Escape didn't finish");
  });

  /* Select */
  await test("select.all: Ctrl+A selects the section's blocks", async () => {
    await sel([alpha.id]);
    await key("Control+a");
    ok((await S()).selection.length === 4, `selected ${(await S()).selection.length}`);
  });
  await test("select.sections: F selects every section", async () => {
    await sel([]);
    await key("f");
    ok((await S()).selection.length === start.sections.length, "not all sections");
  });
  await test("select.parent: Esc goes up to the section", async () => {
    await sel([beta.id]);
    await key("Escape");
    ok((await S()).selection[0] === first.id, "not the section");
  });
  await test("select.child: Enter goes into the section", async () => {
    await sel([first.id]);
    await key("Enter");
    const [picked] = (await S()).selection;
    ok(first.blocks.some((b) => b.id === picked), "not a block of the section");
  });

  /* Arrange */
  const indexOf = async (id) => (await S()).sections[0].blocks.findIndex((b) => b.id === id);
  await test("arrange.up: Alt+↑ moves up the story", async () => {
    await sel([beta.id]);
    await key("Alt+ArrowUp");
    ok((await indexOf(beta.id)) === 1, `at ${await indexOf(beta.id)}`);
  });
  await test("arrange.down: Alt+↓ moves down the story", async () => {
    await sel([beta.id]);
    await key("Alt+ArrowDown");
    ok((await indexOf(beta.id)) === 2, `at ${await indexOf(beta.id)}`);
  });
  const front = free.blocks[1];
  for (const [id, keys] of [
    ["arrange.nudgeLeft", ["ArrowLeft", "Shift+ArrowLeft"]],
    ["arrange.nudgeRight", ["ArrowRight", "Shift+ArrowRight"]],
    ["arrange.nudgeUp", ["ArrowUp", "Shift+ArrowUp"]],
    ["arrange.nudgeDown", ["ArrowDown", "Shift+ArrowDown"]],
  ])
    await test(`${id}: ${keys.join(" and ")} on a free canvas`, async () => {
      for (const k of keys) {
        const before = await blockJson(front.id);
        await sel([front.id]);
        await key(k);
        ok((await blockJson(front.id)) !== before, `${k} didn't move it`);
      }
    });
  const freeJson = async () => (await S()).sections[1].json;
  for (const [id, k] of [
    ["arrange.forward", "BracketRight"],
    ["arrange.backward", "BracketLeft"],
    ["arrange.front", "Shift+BracketRight"],
    ["arrange.back", "Shift+BracketLeft"],
  ])
    await test(`${id}: ${k}`, async () => {
      const target = id === "arrange.forward" || id === "arrange.front" ? free.blocks[0] : free.blocks[1];
      const before = await freeJson();
      await sel([target.id]);
      await key(k);
      ok((await freeJson()) !== before, "the stacking didn't change");
      await key("Control+z");
    });

  /* View */
  for (const [id, k, bp] of [
    ["view.tablet", "Alt+Digit2", "tablet"],
    ["view.phone", "Alt+Digit3", "phone"],
    ["view.desktop", "Alt+Digit1", "desktop"],
  ])
    await test(`${id}: ${k}`, async () => {
      await sel([]);
      await key(k);
      ok((await S()).bp === bp, (await S()).bp);
    });
  const zoom = async () => (await S()).camera.zoom;
  await test("view.zoomIn: Ctrl+=", async () => {
    await blur();
    const z = await zoom();
    await key("Control+Equal");
    ok((await zoom()) > z, "didn't zoom in");
  });
  await test("view.zoomOut: Ctrl+−", async () => {
    const z = await zoom();
    await key("Control+Minus");
    ok((await zoom()) < z, "didn't zoom out");
  });
  await test("view.zoom100: Shift+0 and Ctrl+0", async () => {
    await key("Shift+Digit0");
    ok(Math.abs((await zoom()) - 1) < 1e-6, `Shift+0 gave ${await zoom()}`);
    await key("Control+Minus");
    await key("Control+Digit0");
    ok(Math.abs((await zoom()) - 1) < 1e-6, `Ctrl+0 gave ${await zoom()}`);
  });
  await test("view.fit: Shift+1", async () => {
    await key("Shift+Digit1");
    ok(Math.abs((await zoom()) - 1) > 1e-3, "still at 100%");
  });
  await test("view.zoomSelection: Shift+2", async () => {
    await sel([alpha.id]);
    const c = JSON.stringify((await S()).camera);
    await key("Shift+Digit2");
    ok(JSON.stringify((await S()).camera) !== c, "camera didn't move");
  });
  await test("view.rulers: Ctrl+Shift+R", async () => {
    await blur();
    const r = (await S()).rulers;
    await key("Control+Shift+r");
    ok((await S()).rulers !== r, "no change");
    await key("Control+Shift+r");
  });
  await test("view.columns: Shift+G", async () => {
    await blur();
    const c = (await S()).columns;
    await key("Shift+g");
    ok((await S()).columns !== c, "no change");
    await key("Shift+g");
  });
  await test("view.hand: H", async () => {
    await blur();
    await key("h");
    ok((await S()).tool === "hand", (await S()).tool);
  });
  await test("view.select: V", async () => {
    await key("v");
    ok((await S()).tool === "select", (await S()).tool);
  });

  /* Panels */
  for (const [id, k, tab] of [
    ["panel.insert", "i", "insert"],
    ["panel.media", "m", "media"],
    ["panel.history", "Shift+h", "history"],
    ["panel.layers", "l", "layers"],
  ])
    await test(`${id}: ${k}`, async () => {
      await blur();
      await key(k);
      ok((await S()).leftTab === tab, (await S()).leftTab);
    });
  await test("panel.settings: Ctrl+, opens and closes settings", async () => {
    await blur();
    await key("Control+Comma");
    ok((await S()).settings, "not open");
    await page.waitForTimeout(300);
    await key("Control+Comma");
    ok(!(await S()).settings, "not closed");
  });
  await test("panel.palette: Ctrl+K, and a command run from it", async () => {
    await blur();
    await key("Control+Minus");
    await key("Control+k");
    ok((await S()).palette, "not open");
    await page.keyboard.type("Zoom to 100");
    await page.waitForTimeout(200);
    await key("Enter");
    await page.waitForTimeout(200);
    ok(!(await S()).palette, "didn't close");
    ok(Math.abs((await zoom()) - 1) < 1e-6, "the command didn't run");
  });
  await test("panel.shortcuts: ? opens and closes the sheet", async () => {
    await blur();
    await key("?");
    ok((await S()).sheet, "not open");
    await key("?");
    ok(!(await S()).sheet, "not closed");
  });

  /* Home */
  await page.goto(STUDIO);
  await page.waitForTimeout(1200);
  await test("home.new: N opens the new-project picker", async () => {
    await blur();
    await key("n");
    ok(await page.locator("dialog[open]").count(), "no picker");
    await key("Escape");
  });
  await test("home.search: / focuses search", async () => {
    await blur();
    await key("/");
    ok(await page.evaluate(() => document.activeElement?.matches("input")), "search not focused");
    await key("Escape");
  });
  await test("home.view: V switches grid and table", async () => {
    await blur();
    const before = await page.locator("table").count();
    await key("v");
    const after = await page.locator("table").count();
    await key("v");
    ok(before !== after, "no switch");
  });

  return JSON.stringify(results);
}
