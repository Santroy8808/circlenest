import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSafeImageUpload } from "@/lib/security/uploads";
import { saveUploadToLocal } from "@/lib/security/upload-storage";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  if (!isSafeImageUpload({ size: file.size, type: file.type })) {
    return NextResponse.json({ error: "Invalid file type or size" }, { status: 400 });
  }

  const url = await saveUploadToLocal(file);
  return NextResponse.json({ ok: true, url });
}
