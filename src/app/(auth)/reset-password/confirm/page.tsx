import ResetPasswordConfirmClient from "./reset-password-confirm-client";

export default function ResetPasswordConfirmPage({ searchParams }: { searchParams?: { token?: string } }) {
  return <ResetPasswordConfirmClient token={searchParams?.token ?? ""} />;
}
