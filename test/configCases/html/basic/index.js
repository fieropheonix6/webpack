"use strict";

/** @type {import("../../../../").Configuration} */

import page from "./page.html";

it("should compile and export html as string", () => {
	expect(typeof page).toBe("string");
	expect(page).toContain("<h1>Hello World</h1>");
	expect(page).toContain("<!DOCTYPE html>");
});
