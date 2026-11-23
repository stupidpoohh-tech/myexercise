import { CHARACTER_IDS, idleImage } from '../../character';
import { setCharacter, useCharacter } from '../../character/selection';

/** 캐릭터 선택 (제공된 3종 중 하나) */
export function CharacterPicker() {
  const id = useCharacter();
  return (
    <div className="char-picker" role="radiogroup" aria-label="캐릭터 선택">
      {CHARACTER_IDS.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={c === id}
          aria-label={`캐릭터 ${c}`}
          className={c === id ? 'is-on' : ''}
          onClick={() => setCharacter(c)}
        >
          <img src={idleImage(c)} alt="" draggable={false} />
        </button>
      ))}
    </div>
  );
}
