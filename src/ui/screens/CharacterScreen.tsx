import { Check } from 'lucide-react';
import { CHARACTER_IDS, idleImage } from '../../character';
import { setCharacter, useCharacter } from '../../character/selection';
import { CharacterStage } from '../components/CharacterStage';
import { PageHeader } from '../components/Chrome';
import { Card, SectionHeader } from '../components/ui';

export function CharacterScreen() {
  const id = useCharacter();
  return (
    <main className="screen">
      <PageHeader title="내 캐릭터" />
      <Card className="today-card">
        <div className="stage stage-lg">
          <CharacterStage />
        </div>
        <div className="char-name">캐릭터 {id}</div>
      </Card>
      <section>
        <SectionHeader title="캐릭터 선택" />
        <div className="char-grid" role="radiogroup" aria-label="캐릭터 선택">
          {CHARACTER_IDS.map((c) => (
            <button key={c} role="radio" aria-checked={c === id} className={`char-option ${c === id ? 'is-on' : ''}`} onClick={() => setCharacter(c)}>
              <img src={idleImage(c)} alt="" draggable={false} />
              <span>캐릭터 {c}</span>
              {c === id && (
                <i className="char-check">
                  <Check size={14} strokeWidth={3} />
                </i>
              )}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
