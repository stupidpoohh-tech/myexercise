import { Lock } from 'lucide-react';
import { idleImage } from '../../character';
import { GROWTH_STAGES } from '../../character/growth';
import { CharacterStage } from '../components/CharacterStage';
import { PageHeader } from '../components/Chrome';
import { GrapeBerry } from '../components/graphics';
import { Card, ProgressBar, SectionHeader } from '../components/ui';
import { useGrowth } from '../hooks/useGrowth';

export function CharacterScreen() {
  const g = useGrowth();
  return (
    <main className="screen">
      <PageHeader title="내 캐릭터" />
      <Card className="today-card">
        <div className="growth-head">
          <span className="badge badge-done">{g.stage}단계</span>
          <span className="growth-grapes">
            <GrapeBerry filled size={16} /> 모은 포도알 <b>{g.grapes}</b>개
          </span>
        </div>
        <div className="stage stage-lg">
          <CharacterStage />
        </div>
        {g.next ? (
          <div className="growth-next">
            <div className="growth-next-text">
              다음 성장까지 포도알 <b>{g.next.remaining}</b>개
            </div>
            <ProgressBar value={g.next.progress * 100} max={100} />
          </div>
        ) : (
          <div className="growth-next growth-max">마지막 단계까지 성장했어요</div>
        )}
      </Card>

      <section>
        <SectionHeader title="성장 단계" />
        <ol className="growth-list">
          {GROWTH_STAGES.map((s) => {
            const reached = g.grapes >= s.minGrapes;
            const current = s.stage === g.stage;
            return (
              <li key={s.stage} className={`growth-item ${reached ? 'is-reached' : 'is-locked'} ${current ? 'is-current' : ''}`}>
                <div className="growth-thumb">
                  <img src={idleImage(s.character)} alt={reached ? `${s.stage}단계 캐릭터` : ''} draggable={false} />
                  {!reached && (
                    <i className="growth-lock" aria-hidden>
                      <Lock size={16} strokeWidth={2} />
                    </i>
                  )}
                </div>
                <div className="growth-label">{s.stage}단계</div>
                <div className="caption">{s.minGrapes === 0 ? '시작' : `포도알 ${s.minGrapes}개`}</div>
              </li>
            );
          })}
        </ol>
        <p className="caption growth-help">하루 스쿼트 100회를 달성할 때마다 포도알 1개가 모이고, 포도알이 쌓이면 캐릭터가 성장합니다.</p>
      </section>
    </main>
  );
}
