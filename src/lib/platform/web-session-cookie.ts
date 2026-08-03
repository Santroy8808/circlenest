const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function splitCombinedSetCookieHeader(header: string) {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    const tail = header.slice(index).toLowerCase();

    if (tail.startsWith("expires=")) {
      inExpires = true;
    }

    if (inExpires && char === ";") {
      inExpires = false;
    }

    if (!inExpires && char === ",") {
      const next = header.slice(index + 1);
      if (/^\s*[^=;,\s]+=/u.test(next)) {
        cookies.push(header.slice(start, index).trim());
        start = index + 1;
      }
    }
  }

  const last = header.slice(start).trim();
  if (last) cookies.push(last);
  return cookies.filter(Boolean);
}

function getSetCookieHeaders(headers: Headers) {
  const nativeCookies = (headers as HeadersWithSetCookie).getSetCookie?.();
  if (nativeCookies?.length) return nativeCookies;

  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookieHeader(combined) : [];
}

function isAuthSessionCookie(setCookie: string) {
  return SESSION_COOKIE_NAMES.some((name) => setCookie.startsWith(name) || setCookie.startsWith(`${name}.`));
}

export function makeAuthSessionCookieBrowserScoped(setCookie: string) {
  if (!isAuthSessionCookie(setCookie)) return setCookie;

  return setCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^expires=/iu.test(part) && !/^max-age=/iu.test(part))
    .join("; ");
}

export function forceBrowserScopedAuthSessionCookies(response: Response) {
  const setCookies = getSetCookieHeaders(response.headers);
  if (setCookies.length === 0) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");

  for (const setCookie of setCookies) {
    headers.append("set-cookie", makeAuthSessionCookieBrowserScoped(setCookie));
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}
