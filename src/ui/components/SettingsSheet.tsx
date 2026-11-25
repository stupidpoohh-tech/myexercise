import { Activity, Copy, Download, Link2, Send, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { dateKey } from '../../core/util/date';
import { resyncShare, share, storage, workout } from '../../services';
import { useShare } from '../hooks/useShare';
import { useDailyRecords } from '../hooks/useRecords';
import { BottomSheet } from './BottomSheet';
import { Button, Notice } from './ui';

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
      resyncShare();
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
      <ShareSection />

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

function agoText(iso: string | null): string {
  if (!iso) return '아직 업데이트 전';
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return '방금 업데이트';
  if (min < 60) return `${min}분 전 업데이트`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 전 업데이트` : `${Math.floor(h / 24)}일 전 업데이트`;
}

/** 포도알 공유: 링크를 받은 사람이 내 포도알 현황을 실시간으로 볼 수 있다 (읽기 전용) */
function ShareSection() {
  const st = useShare();
  const { records } = useDailyRecords();
  const [name, setName] = useState(st.name);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = share.link;

  const create = async () => {
    setBusy(true);
    setMsg(null);
    const ok = await share.enable(records, name);
    setBusy(false);
    if (ok) setMsg('공유 링크를 만들었어요.');
  };

  const send = async () => {
    if (!link) return;
    const title = st.name ? `${st.name}의 포도알` : '내 포도알';
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title} 보러 오기`, url: link });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await copy();
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMsg('링크를 복사했어요.');
    } catch {
      setMsg('복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.');
    }
  };

  const stop = async () => {
    if (!window.confirm('공유를 중지할까요? 지금 링크로는 더 이상 볼 수 없게 됩니다.')) return;
    setBusy(true);
    const ok = await share.disable();
    setBusy(false);
    setMsg(ok ? '공유를 중지했어요.' : null);
  };

  return (
    <>
      <h3 className="bs-section">포도알 공유</h3>
      {!st.enabled ? (
        <div className="share-box">
          <p className="share-desc">링크를 받은 사람이 내 포도알과 오늘 횟수를 실시간으로 볼 수 있어요. 보는 사람은 수정할 수 없어요.</p>
          <input
            className="input"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="보여줄 이름 (선택)"
            aria-label="보여줄 이름"
          />
          <Button onClick={() => void create()} disabled={busy} icon={<Link2 size={18} strokeWidth={2} />}>
            {busy ? '만드는 중…' : '공유 링크 만들기'}
          </Button>
        </div>
      ) : (
        <div className="share-box">
          <div className="share-link" aria-label="공유 링크">
            {link}
          </div>
          <div className="share-actions">
            <Button onClick={() => void send()} icon={<Send size={18} strokeWidth={2} />}>
              링크 보내기
            </Button>
            <Button variant="secondary" onClick={() => void copy()} icon={<Copy size={18} strokeWidth={2} />}>
              복사
            </Button>
          </div>
          <div className="share-meta">
            <span>{st.status === 'syncing' ? '업데이트 중…' : agoText(st.lastSyncedAt)}</span>
            <button className="share-stop" onClick={() => void stop()} disabled={busy}>
              공유 중지
            </button>
          </div>
          <p className="share-desc">공유되는 정보: 날짜별 스쿼트 횟수, 캐릭터 단계{st.name ? ', 이름' : ''}. 운동 시각 등 세부 기록은 공유되지 않아요.</p>
        </div>
      )}
      {st.status === 'error' && st.error && <Notice tone="error" title={st.error} />}
      {msg && st.status !== 'error' && <p className="caption share-msg">{msg}</p>}
    </>
  );
}
