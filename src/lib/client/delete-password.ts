"use client";

const DELETE_PASSWORD_HEADER = "x-delete-password";

export function promptForDeletePassword() {
  const password = window.prompt("Enter the DELETE password to authorize this destructive action.");
  return password?.trim() ? password : null;
}

export function deletePasswordHeaders(password: string) {
  return { [DELETE_PASSWORD_HEADER]: password };
}

export function withDeletePassword<TBody extends Record<string, unknown>>(
  body: TBody,
  password: string,
) {
  return { ...body, deletePassword: password };
}
