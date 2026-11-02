// Block every save commit and world write before any page loads; count what was blocked.
export async function guard(page, out) {
  out.blocked = []; out.applies = []; out.posts = [];
  await page.route((url) => /\/commit$/.test(url.pathname) || /^\/api\/world\/(placement|dungeons)/.test(url.pathname), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    out.blocked.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"blocked by live check"}' });
  });
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    const p = new URL(r.url()).pathname.replace(/^\/api/, "");
    out.posts.push(p);
    if (/paint\/apply$/.test(p)) out.applies.push(r.postData()?.slice(0, 160));
  });
}
