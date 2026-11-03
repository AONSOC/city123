import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="ติดตั้งเกมลง PC (Install App)"
        className={
          compact
            ? 'h-9 px-3 rounded-lg bg-[#111d2e] hover:bg-[#192b44] border border-sky-500/40 text-sky-300 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'px-4 py-2.5 rounded-lg bg-[#111d2e] hover:bg-[#182940] border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <svg className="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
        </svg>
        <span>{compact ? 'ติดตั้งลง PC' : 'ติดตั้งเกมลง PC (PWA)'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div className="w-full max-w-md rounded-xl bg-[#0f1a2a] border border-sky-500/30 p-6 shadow-2xl text-slate-100">
            <h3 id="pwa-install-guide-title" className="text-lg font-bold font-display text-sky-300">
              ติดตั้ง MetroTerra 3D ลงบนคอมพิวเตอร์ (PC) หรืออุปกรณ์ของคุณ
            </h3>
            {isIOS ? (
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                1. แตะปุ่ม <strong>แชร์ (Share)</strong> บนแถบเครื่องมือ Safari<br />
                2. เลือกเมนู <strong>เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</strong> เพื่อเข้าเล่นแบบเต็มจอได้ทันที
              </p>
            ) : (
              <div className="mt-3 text-sm text-slate-300 space-y-2 leading-relaxed">
                <p>
                  ตัวเกมรองรับเทคโนโลยี <strong>WebGL + Progressive Web App (PWA)</strong> สามารถติดตั้งเป็นแอปพลิเคชันเดสก์ท็อปบน Windows, macOS หรือ Linux และเล่นแบบออฟไลน์ได้:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-200">
                  <li>คลิกไอคอน <strong>ติดตั้ง (Install MetroTerra 3D)</strong> ทางขวาของแถบ URL บน Chrome หรือ Edge</li>
                  <li>หากกำลังเปิดในหน้าต่างพรีวิว ให้เปิดเกมในแท็บใหม่เพื่อกดติดตั้งลง Desktop ได้ทันที</li>
                </ol>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
