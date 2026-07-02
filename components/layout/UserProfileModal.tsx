"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Trash2, Pencil } from "lucide-react";

import { useAppStore } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { compressImageFile } from "@/lib/imageCompression";

function readFileAsDataUrl(file: File) {
  // Compress large images on the way in so they don't blow the localStorage
  // quota or bloat sync payloads (falls back to the original on failure).
  return compressImageFile(file);
}

/**
 * Profile management modal. Lets the signed-in user set their display name and
 * role, and upload/remove the digital signature image that the document and
 * IPC modules reuse. The signature lives on `userSignatureProfile`; saving also
 * mirrors it to the `profiles` row when Supabase is configured.
 */
export default function UserProfileModal({
  open,
  onClose,
  email,
}: {
  open: boolean;
  onClose: () => void;
  email?: string | null;
}) {
  const { userSignatureProfile, setUserSignatureProfile, clearUserSignatureProfile } = useAppStore();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed from the stored profile each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setName(userSignatureProfile?.displayName || "");
    setRole(userSignatureProfile?.roleTitle || "");
    setImage(userSignatureProfile?.imageDataUrl || "");
  }, [open, userSignatureProfile]);

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setImage(dataUrl);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedRole = role.trim();
      if (image) {
        setUserSignatureProfile({
          displayName: trimmedName || "Authorized Signatory",
          roleTitle: trimmedRole || undefined,
          imageDataUrl: image,
          updatedAt: new Date().toISOString(),
        });
      } else {
        clearUserSignatureProfile();
      }

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from("profiles")
              .update({
                full_name: trimmedName || null,
                signature_display_name: image ? trimmedName || null : null,
                signature_role_title: image ? trimmedRole || null : null,
                signature_image_data_url: image || null,
              })
              .eq("id", user.id);
          }
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-[11px] uppercase tracking-wider text-txt-dim mb-1.5 font-medium";
  const inputCls =
    "w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-txt outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

  return (
    <Modal open={open} onClose={onClose} title="My profile" width={520}>
      <div className="space-y-5">
        {email ? (
          <div>
            <label className={labelCls}>Email</label>
            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-txt-muted">{email}</div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Smith" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Role / title</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Resident Engineer" className={inputCls} />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls + " mb-0"}>Digital signature</label>
            {image ? (
              <button
                type="button"
                onClick={() => setImage("")}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-txt-dim transition hover:bg-err/10 hover:text-err"
              >
                <Trash2 size={12} /> Remove
              </button>
            ) : null}
          </div>
          <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg-surface">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Signature" className="h-full w-full object-contain p-3" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-txt-dim">
                <Pencil size={18} />
                <span className="text-xs">No signature saved</span>
              </div>
            )}
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-medium text-txt transition hover:bg-bg-hover">
            <ImagePlus size={14} />
            {image ? "Replace signature" : "Upload signature"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                await handleUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="mt-2 text-[11px] text-txt-dim">
            Upload a transparent PNG of your signature. It stays blank on certificates until you apply it from the IPC settings.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
