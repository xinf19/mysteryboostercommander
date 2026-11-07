const milestones = [
  { date: "2026-10-19", name: "the Festival in a Box launch" },
  { date: "2026-11-13", name: "Commander legality" },
  { date: "2027-01-01", name: "legality in all Eternal formats" },
];

const shanghaiDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function onRequestGet(context) {
  const response = await context.next();
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }

  const today = shanghaiDate.format(new Date());
  const next = milestones.find(({ date }) => date > today);
  let message = "All listed dates have been reached. Card-specific legality restrictions still apply.";
  if (next) {
    const days = (Date.parse(next.date) - Date.parse(today)) / 86_400_000;
    message = `${days} ${days === 1 ? "day" : "days"} until ${next.name} on ${next.date}`;
  }

  const html = new Response(response.body, response);
  html.headers.delete("ETag");
  html.headers.set("Cache-Control", "no-store");
  return new HTMLRewriter()
    .on("#countdown-fallback", { element: (element) => element.setInnerContent(message) })
    .transform(html);
}
