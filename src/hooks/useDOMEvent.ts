import { observe } from "../utils/Observer"
import { RefObject, useEffect } from "react"

type TargetType = EventTarget|AbstractWorker|GlobalEventHandlers|MessageEventTarget<any>|ShadowRoot|WindowEventHandlers

type _EvtMap<T extends TargetType> = 
    T extends Document ? DocumentEventMap :
    T extends Window ? WindowEventMap :
    //
    T extends HTMLVideoElement ? HTMLVideoElementEventMap : // extends HTMLmediaElement
    T extends HTMLMediaElement ? HTMLMediaElementEventMap : // extends HTMLElement
    T extends HTMLBodyElement ? HTMLBodyElementEventMap : // extends HTMLElement
    T extends HTMLElement ? HTMLElementEventMap : // extends Element
    T extends MathMLElement ? MathMLElementEventMap : // extends Element
    T extends SVGSVGElement ? SVGSVGElementEventMap : // extends SVGElement
    T extends SVGElement ? SVGElementEventMap : // extends Element
    T extends Element ? ElementEventMap :
    T extends AbortSignal ? AbortSignalEventMap :
    T extends ServiceWorker ? ServiceWorkerEventMap : // extends AbstractWorker
    T extends Worker ? WorkerEventMap : // extends AbstractWorker, MessageEventTarget<Worker>
    T extends AbstractWorker ? AbstractWorkerEventMap :
    T extends Animation ? AnimationEventMap :
    T extends AudioScheduledSourceNode ? AudioScheduledSourceNodeEventMap :
    T extends OfflineAudioContext ? OfflineAudioContextEventMap : // extends BaseAudioContext
    T extends BaseAudioContext ? BaseAudioContextEventMap :
    T extends AudioDecoder ? AudioDecoderEventMap :
    T extends AudioEncoder ? AudioEncoderEventMap :
    T extends AudioWorkletNode ? AudioWorkletNodeEventMap :
    T extends BroadcastChannel ? BroadcastChannelEventMap :
    T extends MediaStreamTrack ? MediaStreamTrackEventMap :
    T extends EventSource ? EventSourceEventMap :
    T extends FileReader ? FileReaderEventMap :
    T extends FontFaceSet ? FontFaceSetEventMap :
    T extends IDBDatabase ? IDBDatabaseEventMap :
    T extends IDBOpenDBRequest ? IDBOpenDBRequestEventMap :
    T extends IDBTransaction ? IDBTransactionEventMap :
    T extends MIDIAccess ? MIDIAccessEventMap :
    T extends MIDIInput ? MIDIInputEventMap : // extends MIDIPort
    T extends MIDIPort ? MIDIPortEventMap :
    T extends MediaDevices ? MediaDevicesEventMap :
    T extends MediaKeySession ? MediaKeySessionEventMap :
    T extends MediaQueryList ? MediaQueryListEventMap :
    T extends MediaRecorder ? MediaRecorderEventMap :
    T extends MediaSource ? MediaSourceEventMap :
    T extends MediaStream ? MediaStreamEventMap :
    T extends MessagePort ? MessagePortEventMap : //extends MessageEventTarget<MessagePort>
    T extends MessageEventTarget<any> ? MessageEventTargetEventMap :
    T extends NavigationHistoryEntry ? NavigationHistoryEntryEventMap :
    T extends Notification ? NotificationEventMap :
    T extends OffscreenCanvas ? OffscreenCanvasEventMap :
    T extends PaymentRequest ? PaymentRequestEventMap :
    T extends PaymentResponse ? PaymentResponseEventMap :
    T extends Performance ? PerformanceEventMap :
    T extends PermissionStatus ? PermissionStatusEventMap :
    T extends PictureInPictureWindow ? PictureInPictureWindowEventMap :
    T extends RTCDTMFSender ? RTCDTMFSenderEventMap :
    T extends RTCDataChannel ? RTCDataChannelEventMap :
    T extends RTCDtlsTransport ? RTCDtlsTransportEventMap :
    T extends RTCIceTransport ? RTCIceTransportEventMap :
    T extends RTCPeerConnection ? RTCPeerConnectionEventMap :
    T extends RTCSctpTransport ? RTCSctpTransportEventMap :
    T extends RemotePlayback ? RemotePlaybackEventMap :
    T extends ScreenOrientation ? ScreenOrientationEventMap :
    T extends ServiceWorkerContainer ? ServiceWorkerContainerEventMap :
    T extends ServiceWorkerRegistration ? ServiceWorkerRegistrationEventMap :
    T extends ShadowRoot ? ShadowRootEventMap :
    T extends SourceBuffer ? SourceBufferEventMap :
    T extends SourceBufferList ? SourceBufferListEventMap :
    T extends SpeechSynthesis ? SpeechSynthesisEventMap :
    T extends SpeechSynthesisUtterance ? SpeechSynthesisUtteranceEventMap :
    T extends TextTrack ? TextTrackEventMap :
    T extends TextTrackCue ? TextTrackCueEventMap :
    T extends TextTrackList ? TextTrackListEventMap :
    T extends VideoDecoder ? VideoDecoderEventMap :
    T extends VideoEncoder ? VideoEncoderEventMap :
    T extends VisualViewport ? VisualViewportEventMap :
    T extends WakeLockSentinel ? WakeLockSentinelEventMap :
    T extends WebSocket ? WebSocketEventMap :
    T extends WindowEventHandlers ? WindowEventHandlersEventMap :
    T extends XMLHttpRequest ? XMLHttpRequestEventMap : // extends XMLHttpRequestEventTarget
    T extends XMLHttpRequestEventTarget ? XMLHttpRequestEventTargetEventMap :
    T extends GlobalEventHandlers ? GlobalEventHandlersEventMap :
    never

export function useDOMEvent<T extends TargetType, E extends keyof _EvtMap<T>>(
    handler : (this: T, event: _EvtMap<T>[E]) => any, target: T|RefObject<T|null|undefined>, event: E,
    options?: boolean|AddEventListenerOptions) {

    useEffect(()=> {
        if ('current' in target) {
            let current: T|null|undefined = target.current
            const args = [event, handler, options] as [string, EventListener, typeof options]
            observe(target, 'current', (node)=> {
                current?.removeEventListener(...args)
                node?.addEventListener(...args)
                current = node
            })
            return ()=> { current?.removeEventListener(...args) }
        } else if (target) {
            target.addEventListener(event as string, handler as EventListener,
                options)
            return target.removeEventListener.bind(target, event as string,
                handler as EventListener, options)
        }
    }, [target, event, options])
}