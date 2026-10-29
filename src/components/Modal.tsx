"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, icon, wide, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#02030a]/70 p-0 backdrop-blur-md sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={`glass rise flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl ${wide ? "max-w-[min(96vw,92rem)]" : "max-w-[min(96vw,46rem)]"}`}>
        <header className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          {icon}
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="ปิด" className="baseline-center h-9 w-9 justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
};
