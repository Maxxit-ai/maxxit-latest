function getEnv() {
  const backendUrl = process.env.ZG_BACKEND_URL;

  if (!backendUrl) {
    throw new Error("ZG_BACKEND_URL must be set");
  }

  return {
    backendUrl: backendUrl.replace(/\/$/, ""),
    authToken: process.env.ZG_BACKEND_AUTH_TOKEN,
  };
}

export async function uploadAlphaContent(
  content: object
): Promise<{ rootHash: string; txHash: string }> {
  const { backendUrl, authToken } = getEnv();
  const res = await fetch(`${backendUrl}/storage/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`0G backend storage upload failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.success || !data.rootHash || !data.txHash) {
    throw new Error(data.error || "0G backend returned empty storage upload response");
  }

  return { rootHash: data.rootHash, txHash: data.txHash };
}

export async function downloadAlphaContent(rootHash: string): Promise<object> {
  const { backendUrl, authToken } = getEnv();
  const res = await fetch(`${backendUrl}/storage/${encodeURIComponent(rootHash)}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`0G backend storage download failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.success || !data.content) {
    throw new Error(data.error || "0G backend returned empty storage download response");
  }

  return data.content;
}
