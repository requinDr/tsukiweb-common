import { ScriptPlayerBase } from "../script/ScriptPlayer";
import { AudioManager } from "./AudioManager";
import { CommandProcessFunction } from "../script/types";

export const autoPlayEnablingEvents = [
    'auxclick', 'click'    , 'contextmenu',
    'dblclick', 'mousedown', 'mouseup',
    'keydown' , 'keyup'    , 'touchend'
]

export function calcGain(value: number) {
  if (value <= 0)
    return 0
  const valueRange = 10 // from 0 to 10. 0 => no sound.
  const dbRange = 25 // from -25dB to 0dB. -25 not used (volume=0 => no sound).
  const normalizedValue = value / valueRange
  const dB = normalizedValue * dbRange - dbRange
  return Math.pow(10, dB / 20)
}

type SPB = ScriptPlayerBase<any, any, any, any>

export function createCommands<SP extends SPB>(audio: AudioManager): Record<string, CommandProcessFunction<SP>> {
  return {
    'wave'    : (arg, _, script)=> {
      script.audio.looped_se = null
      audio.playWave(arg)
    },
    'waveloop': (arg, _, script)=> {
      script.audio.looped_se = audio.waveLoop = arg
    },
    'wavestop': (_a, _c, script)=> {
      script.audio.looped_se = audio.waveLoop = null
    },
    'play'    : (arg, _, script)=> {
      script.audio.track = audio.track = arg
    },
    'playstop': (_a, _c, script)=> {
      script.audio.track = audio.track = null
    }
  }
}