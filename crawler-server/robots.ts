// Real robots.txt compliance (Disallow/User-agent rules), not just "is robots.txt
// reachable" (the gap found in the original industrialpedia-acquisition-engine-v1).
import robotsParser from "npm:robots-parser@3.0.1";

const USER_AGENT = "IndustrialpediaAcquisitionEngine/2.0-vps";

export async function isAllowed(url: string): Promise<{ allowed: boolean; status: string }> {
  let robotsUrl: string;
  try {
    const u = new URL(url);
    robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
  } catch {
    return { allowed: false, status: "invalid_url" };
  }

  let text: string;
  try {
    const r = await fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(7000) });
    if (r.status >= 400) return { allowed: true, status: "not_present" };
    text = await r.text();
  } catch {
    return { allowed: false, status: "network_error" };
  }

  const robots = robotsParser(robotsUrl, text);
  const allowed = robots.isAllowed(url, USER_AGENT) !== false;
  return { allowed, status: allowed ? "fetched_allowed" : "fetched_disallowed" };
}

export { USER_AGENT };
