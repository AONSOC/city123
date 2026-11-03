import React, { useState } from 'react';

interface UserGuideModalProps {
  onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<'rci' | 'utilities' | 'loteditor' | 'citizens' | 'import' | 'controls'>('rci');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-[#0b131e] border border-sky-500/40 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-sky-300">คู่มือและคำแนะนำการใช้งานเกม (User Manual)</h2>
              <p className="text-xs text-slate-400">คู่มือฉบับสมบูรณ์สำหรับระบบสร้างเมือง 3 มิติ, RCI 9 ระดับ, และการนำเข้าโมเดล</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-lg font-bold transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body with Sidebar Navigation */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          
          {/* Navigation Sidebar */}
          <div className="w-full md:w-64 bg-slate-900/50 border-r border-slate-800 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('rci')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
                activeSection === 'rci' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>🏙️</span>
              <span>โซน RCI & 9 ระดับ</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('utilities')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
                activeSection === 'utilities' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>⚡</span>
              <span>ไฟฟ้าและประปา</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('loteditor')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
                activeSection === 'loteditor' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>🎨</span>
              <span>Lot Editor & Texture</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('citizens')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
                activeSection === 'citizens' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>🚶</span>
              <span>คนเดินสวน & รถจอด</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('import')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
                activeSection === 'import' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>📦</span>
              <span>นำเข้าโมเดล 3D ทุกรูปแบบ</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('controls')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
                activeSection === 'controls' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>🕹️</span>
              <span>การควบคุมกล้อง</span>
            </button>
          </div>

          {/* Main Info Pane */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-4 text-sm text-slate-300 leading-relaxed">
            {activeSection === 'rci' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <span>🏙️</span> ระบบโซน RCI และการพัฒนา 9 ระดับ
                </h3>
                <p>
                  เกมจำลองการสร้างเมืองใช้ระบบจำลอง RCI (Residential, Commercial, Industrial) แบบสมจริง โดยแบ่งระดับความเจริญออกเป็น <strong>9 ระดับ</strong> ตามความหนาแน่นและมูลค่าที่ดิน:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5">
                    <h4 className="font-bold text-emerald-300 mb-1">ความหนาแน่นต่ำ (Low Lv 1-3)</h4>
                    <p className="text-xs text-slate-400">บ้านเดี่ยวและร้านค้าขนาดย่อม เริ่มต้นสร้างทันทีเมื่อมีถนนไฟฟ้าประปา</p>
                  </div>
                  <div className="bg-sky-950/30 border border-sky-500/30 rounded-xl p-3.5">
                    <h4 className="font-bold text-sky-300 mb-1">ความหนาแน่นกลาง (Medium Lv 4-6)</h4>
                    <p className="text-xs text-slate-400">ตึกแถวพาณิชย์และอพาร์ตเมนต์กลาง พัฒนาเมื่อมูลค่าที่ดินสูงขึ้น</p>
                  </div>
                  <div className="bg-purple-950/30 border border-purple-500/30 rounded-xl p-3.5">
                    <h4 className="font-bold text-purple-300 mb-1">ความหนาแน่นสูง (High Lv 7-9)</h4>
                    <p className="text-xs text-slate-400">ตึกระฟ้าและอาคารธุรกิจขนาดใหญ่ใจกลางเมือง ยกระดับเมื่อเมืองเจริญสูงสุด</p>
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-400">
                  <p className="font-bold text-slate-200 mb-1">💡 ทริคการซ่อน Lot ที่บันทึก:</p>
                  <p>เมื่อคุณสร้างและบันทึก Custom Lot จาก Lot Editor ตัวระบบจะซ่อนออกจากแถบเครื่องมือสร้างโดยอัตโนมัติ และจะสุ่มผุดขึ้น (Organic Spawning) ในโซน RCI ที่คุณจัดสรรไว้ตามความเหมาะสม</p>
                </div>
              </div>
            )}

            {activeSection === 'utilities' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                  <span>⚡</span> ระบบไฟฟ้าและประปา (เงื่อนไขก่อนพัฒนา RCI)
                </h3>
                <p>
                  <strong>กฎเหล็กของเมือง:</strong> แปลงโซน RCI ทั้งหมดจะไม่ยอมก่อสร้างและพัฒนาเด็ดขาด จนกว่าจะมีระบบสาธารณูปโภคพื้นฐานครบถ้วน:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-xs text-slate-300">
                  <li><strong>เชื่อมต่อถนน (Road Connection):</strong> แปลงที่ดินต้องอยู่ติดหรือใกล้ถนนหลักภายในระยะ 3 ช่อง</li>
                  <li><strong>กระแสไฟฟ้า (Power Grid):</strong> ต้องสร้างโรงไฟฟ้า (ถ่านหิน, พลังงานลม, พลังงานแสงอาทิตย์) ให้เพียงพอกับความต้องการของเมือง</li>
                  <li><strong>ระบบน้ำประปา (Water Grid):</strong> ต้องสร้างสถานีสูบน้ำหรือหอถังน้ำประปาเพื่อให้ครอบคลุมพื้นที่</li>
                </ul>
              </div>
            )}

            {activeSection === 'loteditor' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-teal-400 flex items-center gap-2">
                  <span>🎨</span> Lot Editor & การวาง Texture ทีละช่อง
                </h3>
                <p>
                  เครื่องมือ Lot Editor ช่วยให้คุณออกแบบอาคารและพื้นที่ส่วนตัวได้ตามต้องการ:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-xs text-slate-300">
                  <li><strong>วาง Texture ทีละช่อง:</strong> คุณสามารถคลิกหรือลากระบายบนตาราง 3D และผัง 2D เพื่อเปลี่ยนพื้นผิวเฉพาะช่องนั้นๆ ได้ทันที (หญ้า, คอนกรีต, ยางมะตอย, อิฐ, ดิน)</li>
                  <li><strong>ไม่มีการทับซ้อน:</strong> ระบบจะทำการแทนที่พื้นผิวเดิม (Replace) ทันที ห้ามแสดงทับซ้อนกันทั้งในเกมและใน Lot Editor</li>
                  <li><strong>ตกแต่งสิ่งของ (Props):</strong> วางต้นไม้, ม้านั่ง, ไฟถนน, รถยนต์, และน้ำพุได้อย่างอิสระ</li>
                </ul>
              </div>
            )}

            {activeSection === 'citizens' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
                  <span>🚶</span> คนเดินสวนสาธารณะ & รถจอดตามช่อง
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-xs text-slate-300">
                  <li><strong>คนเดินสวน (Pedestrian Spawning):</strong> ประชาชนจะเดินเล่นผ่อนคลายในสวนสาธารณะตามช่วงเวลาธรรมชาติ <strong>เช้า (06:00), กลางวัน (12:00), และเย็น (18:00)</strong> และจะไม่มีคนเดินในช่วงเวลากลางคืน (20:00 - 06:00) เพื่อความสมจริง</li>
                  <li><strong>รถยนต์จอด (Vehicle Parking):</strong> ยานพาหนะจะขับขี่บนถนนและสุ่มจอดเข้าช่องจอดรถหรือลานจอดที่ผู้เล่นสร้างไว้ตามตารางช่องจอด</li>
                </ul>
              </div>
            )}

            {activeSection === 'import' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-sky-400 flex items-center gap-2">
                  <span>📦</span> นำเข้าโมเดล 3D และเนื้อหาทุกรูปแบบ
                </h3>
                <p>
                  คุณสามารถกดปุ่ม <strong>Mod เสริม / นำเข้า 3D</strong> เพื่อเพิ่มเนื้อหาใหม่เข้าสู่เกมได้ทุกประเภท:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-xs text-slate-300">
                  <li><strong>ไฟล์โมเดล 3D:</strong> รองรับการอัปโหลดไฟล์ <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">.gltf</code>, <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">.glb</code>, และ <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">.obj</code></li>
                  <li><strong>ประเภทเนื้อหา:</strong> เลือกหมวดหมู่ได้ทั้ง อาคาร (Building), ยานพาหนะ (Vehicle), คนและของตกแต่ง (Prop / Character), และภาพ Texture พื้นผิว</li>
                  <li><strong>ปรับแต่งสเกลและสี:</strong> ปรับขนาด (Scale), ความสูง Y-Offset, มุมหมุน และสีสันหลักของวัตถุได้ทันท่วงที</li>
                </ul>
              </div>
            )}

            {activeSection === 'controls' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
                  <span>🕹️</span> การควบคุมมุมกล้อง 3 มิติ
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <h4 className="font-bold text-slate-200 mb-1">หมุนรอบทิศทาง (Orbit)</h4>
                    <p className="text-slate-400">คลิกซ้ายค้างไว้แล้วลากเมาส์ หรือใช้นิ้วเดียวลากบนหน้าจอสัมผัส</p>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <h4 className="font-bold text-slate-200 mb-1">เลื่อนมุมมอง (Pan)</h4>
                    <p className="text-slate-400">คลิกขวาค้างไว้แล้วลาก หรือใช้สองนิ้วลากบนมือถือ</p>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <h4 className="font-bold text-slate-200 mb-1">ซูมเข้า-ออก (Zoom)</h4>
                    <p className="text-slate-400">หมุนลูกกลิ้งเมาส์ (Scroll Wheel) หรือใช้สองนิ้วกาง/หุบ</p>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <h4 className="font-bold text-slate-200 mb-1">คีย์บอร์ดด่วน (WASD)</h4>
                    <p className="text-slate-400">ใช้ปุ่ม WASD เลื่อนมุมมอง และปุ่ม Q / E หมุนกล้องซ้ายขวา 90 องศา</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-900/90 border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer active:scale-95"
          >
            เข้าใจแล้ว, เริ่มเล่นเกมเลย
          </button>
        </div>
      </div>
    </div>
  );
};
