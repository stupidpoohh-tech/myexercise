import { Activity, Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { dateKey } from '../../core/util/date';
import { storage, workout } from '../../services';
import { useDailyRecords } from '../hooks/useRecords';
import { BottomSheet } from './BottomSheet';
import { Notice } from './ui';

/** 설정: 데이터 관리 (기존 백업 파일 형식 그대로 내보내기·가져오기) */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reload } = useDailyRecords();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const download = (data: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSensorLog = () => {
    const log = workout.exportSensorLog();
    if (!log.samples.length) {
      setNotice({ tone: 'info', text: '아직 기록된 센서 값이 없습니다. 운동을 한 번 진행한 뒤 내보내 주세요.' });
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    download(log, `squat-sensor-log-${stamp}.json`);
    setNotice({ tone: 'info', text: `센서 기록 ${Math.round(log.samples.length / 60)}초 분량을 내보냈습니다.` });
  };

  const exportJson = async () => {
    try {
      const data = await storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `squat-records-${dateKey()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ tone: 'info', text: `기록 ${data.sessions.length}건을 내보냈습니다.` });
    } catch (e) {
      setNotice({ tone: 'error', text: `내보내기 실패: ${e instanceof Error ? e.message : e}` });
    }
  };

  const importJson = async (file: File) => {
    try {
      const res = await storage.importData(JSON.parse(await file.text()));
      reload();
      setNotice({ tone: 'info', text: `가져오기 완료 · 세션 ${res.sessions}건, ${res.dates}일 반영 (중복 제외)` });
    } catch (e) {
      const msg = e instanceof SyntaxError ? 'JSON 형식이 아닙니다.' : e instanceof Error ? e.message : String(e);
      setNotice({ tone: 'error', text: `가져오기 실패: ${msg}` });
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setNotice(null);
        onClose();
      }}
      title="설정"
    >
      <h3 className="bs-section">데이터 관리</h3>
      <div className="settings-list">
        <button className="settings-item" onClick={() => void exportJson()}>
          <Download size={20} strokeWidth={2} />
          <span>
            <b>데이터 내보내기</b>
            <small>운동 기록을 JSON 파일로 저장합니다</small>
          </span>
        </button>
        <button className="settings-item" onClick={() => fileRef.current?.click()}>
          <Upload size={20} strokeWidth={2} />
          <span>
            <b>데이터 가져오기</b>
            <small>내보낸 파일로 기록을 복원합니다 · 중복은 합치지 않습니다</small>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importJson(f);
          }}
        />
      </div>
      <h3 className="bs-section">문제 진단</h3>
      <div className="settings-list">
        <button className="settings-item" onClick={exportSensorLog}>
          <Activity size={20} strokeWidth={2} />
          <span>
            <b>센서 기록 내보내기</b>
            <small>인식이 잘 안 된 운동 직후 내보내 전달해 주세요 · 최근 운동의 센서 값만 담깁니다</small>
          </span>
        </button>
      </div>
      {notice && <Notice tone={notice.tone === 'error' ? 'error' : 'info'} title={notice.text} />}
      <p className="caption settings-help">
        기록은 서버가 아닌 이 브라우저(기기)에만 저장됩니다. 브라우저 데이터를 지우거나 다른 기기·브라우저로 옮기면 기록이 보이지 않으므로, 가끔 내보내 두세요.
      </p>
    </BottomSheet>
  );
}
