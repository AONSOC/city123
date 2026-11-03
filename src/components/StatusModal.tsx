import React from 'react';
import { CitySimulationState } from '../game/types';

interface StatusModalProps {
  simState: CitySimulationState;
  saveStatusMessage: string | null;
  onResume: () => void;
  onSaveCity: () => void;
  onLoadCity: () => void;
  onRestartRegion: () => void;
  onReturnToTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  simState,
  saveStatusMessage,
  onResume,
  onSaveCity,
  onLoadCity,
  onRestartRegion,
  onReturnToTitle,
}) => {
  const { status, outcomeReason, metrics, config } = simState;

  if (status !== 'paused' && status !== 'gameover') {
    return null;
  }

  const isVictory = status === 'gameover' && outcomeReason === 'victory_metropolis';
  const isDefeat = status === 'gameover' && outcomeReason === 'defeat_bankruptcy';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div className="w-full max-w-md bg-[#0b131e] border border-slate-700 rounded-2xl p-6 shadow-2xl text-slate-100">
        <h2
          id="status-modal-title"
          className={`text-2xl font-bold font-display ${
            isVictory ? 'text-emerald-400' : isDefeat ? 'text-rose-400' : 'text-sky-300'
          }`}
        >
          {isVictory
            ? 'บรรลุเป้าหมายมหานครสีเขียว! (Metropolis Achieved)'
            : isDefeat
            ? 'งบประมาณเมืองล้มละลาย (Municipal Bankruptcy)'
            : 'พักการจำลองเมือง (Simulation Paused)'}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {isVictory
            ? `มหานคร "${config.cityName}" เติบโตเกิน 2,500 คน พร้อมระดับความสุขสูงอย่างยั่งยืน`
            : isDefeat
            ? 'งบประมาณติดลบเกินเกณฑ์วิกฤต ลองปรับเพิ่มอัตราภาษีหรือลดค่าบำรุงรักษา'
            : `ภูมิภาคขนาด ${config.size}×${config.size} ช่อง (${config.size * 10}×${config.size * 10} เมตร)`}
        </p>

        {/* 3 Tabular-Nums Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 my-5">
          <div className="p-3 rounded-xl bg-[#121f31] border border-slate-800">
            <div className="text-[11px] text-slate-400">ประชากรรวม</div>
            <div className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
              {Math.round(metrics.population).toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#121f31] border border-slate-800">
            <div className="text-[11px] text-slate-400">งบประมาณคลัง</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
              ฿{Math.round(metrics.treasury).toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#121f31] border border-slate-800">
            <div className="text-[11px] text-slate-400">ความสุขพลเมือง</div>
            <div className="text-lg font-bold font-mono tabular-nums text-sky-300 mt-0.5">
              {Math.round(metrics.happiness)}%
            </div>
          </div>
        </div>

        {saveStatusMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-sky-950/90 border border-sky-500/40 text-xs text-sky-200 text-center">
            {saveStatusMessage}
          </div>
        )}

        {/* Primary Action CTAs */}
        <div className="space-y-2.5">
          {status === 'paused' ? (
            <>
              <button
                type="button"
                onClick={onResume}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-300 text-slate-950 font-bold text-sm cursor-pointer transition-all active:scale-98 shadow-lg"
              >
                กลับเข้าสู่การบริหารเมือง (Resume) [Esc]
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onSaveCity}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#132032] hover:bg-[#1b2e47] border border-slate-700 text-xs font-semibold text-emerald-300 cursor-pointer transition-all active:scale-95"
                >
                  บันทึกเมือง (Save)
                </button>
                <button
                  type="button"
                  onClick={onLoadCity}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#132032] hover:bg-[#1b2e47] border border-slate-700 text-xs font-semibold text-sky-300 cursor-pointer transition-all active:scale-95"
                >
                  โหลดเมืองที่บันทึก (Load)
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onRestartRegion}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#132032] hover:bg-[#1b2e47] border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer transition-all active:scale-95"
                >
                  เริ่มภูมิภาคนี้ใหม่ (Restart)
                </button>
                <button
                  type="button"
                  onClick={onReturnToTitle}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#132032] hover:bg-[#1b2e47] border border-slate-700 text-xs font-medium text-slate-300 cursor-pointer transition-all active:scale-95"
                >
                  หน้าจอหลัก (Title Screen)
                </button>
              </div>
            </>
          ) : (
            <>
              {isVictory && (
                <button
                  type="button"
                  data-start="true"
                  onClick={onResume}
                  className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm cursor-pointer transition-all active:scale-98 shadow-lg"
                >
                  บริหารมหานครต่อ (Continue Sandbox)
                </button>
              )}
              <button
                type="button"
                data-start={!isVictory ? 'true' : undefined}
                onClick={onRestartRegion}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm cursor-pointer transition-all active:scale-98 shadow-lg"
              >
                สร้างเมืองใหม่ (Play Again)
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#132032] hover:bg-[#1b2e47] border border-slate-700 text-xs font-medium text-slate-300 cursor-pointer transition-all active:scale-95"
              >
                กลับสู่หน้าตั้งค่าภูมิภาค (Title Screen)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
