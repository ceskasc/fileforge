// A configured address alone does not mean the optional API has been deployed.
export async function cloudIsHealthy(origin, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
 if (!origin) return false;
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), timeoutMs);
 try {
  const response = await fetchImpl(new URL('/api/health', origin), {
   method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
   redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal
  });
  if (!response.ok) return false;
  const report = await response.json();
  return report?.service === 'fileforge' && report?.protocol === 1 &&
   typeof report?.model === 'string' && report.model.length > 0;
 } catch {
  return false;
 } finally {
  clearTimeout(timer);
 }
}
