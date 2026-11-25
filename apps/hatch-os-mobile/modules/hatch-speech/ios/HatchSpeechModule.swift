import AVFoundation
import ExpoModulesCore
import Speech

/// On-device speech recognition for Hatch OS.
/// SFSpeechRecognizer is required to stay on the iPhone. If this locale cannot
/// do that, recognition is refused and only a WAV is kept for the firm host.
public class HatchSpeechModule: Module {
  private let audioEngine = AVAudioEngine()
  private var recognizer: SFSpeechRecognizer?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var tapInstalled = false
  private let sampleLock = NSLock()
  private var samples: [Float] = []
  private var sampleRate: Double = 44100
  private var lastLevelAt = Date.distantPast
  private var stopping = false

  public func definition() -> ModuleDefinition {
    Name("HatchSpeech")

    Events("result", "level", "error")

    AsyncFunction("requestPermissions") { (promise: Promise) in
      AVAudioSession.sharedInstance().requestRecordPermission { micOK in
        SFSpeechRecognizer.requestAuthorization { status in
          promise.resolve(micOK && status == .authorized)
        }
      }
    }

    AsyncFunction("start") { (locale: String, promise: Promise) in
      DispatchQueue.main.async {
        do {
          try self.startSession(locale: locale, recognize: true)
          promise.resolve(["onDevice": true])
        } catch {
          promise.reject("ERR_SPEECH", error.localizedDescription)
        }
      }
    }

    AsyncFunction("startCapture") { (promise: Promise) in
      DispatchQueue.main.async {
        do {
          try self.startSession(locale: "en-US", recognize: false)
          promise.resolve(true)
        } catch {
          promise.reject("ERR_SPEECH", error.localizedDescription)
        }
      }
    }

    AsyncFunction("stop") { (promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(self.stopSession())
      }
    }
  }

  private func startSession(locale: String, recognize: Bool) throws {
    stopping = false
    stopEngine()
    sampleLock.lock()
    samples.removeAll(keepingCapacity: false)
    sampleLock.unlock()

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    if recognize {
      let speech = SFSpeechRecognizer(locale: Locale(identifier: locale))
      guard let speech, speech.isAvailable else {
        throw SpeechFailure.unavailable
      }
      guard speech.supportsOnDeviceRecognition else {
        throw SpeechFailure.onDeviceUnavailable
      }
      recognizer = speech
      let recognition = SFSpeechAudioBufferRecognitionRequest()
      recognition.shouldReportPartialResults = true
      recognition.requiresOnDeviceRecognition = true
      request = recognition
      task = speech.recognitionTask(with: recognition) { [weak self] result, error in
        guard let self else { return }
        if let result {
          let text = result.bestTranscription.formattedString
          DispatchQueue.main.async {
            self.sendEvent("result", ["text": text, "isFinal": result.isFinal, "onDevice": true])
          }
        }
        if let error, !self.stopping {
          DispatchQueue.main.async {
            self.sendEvent("error", ["message": error.localizedDescription])
          }
        }
      }
    }

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw SpeechFailure.format
    }
    sampleRate = format.sampleRate
    let cap = Int(format.sampleRate * 20)

    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      guard let self else { return }
      self.request?.append(buffer)
      guard let channel = buffer.floatChannelData?[0] else { return }
      let frames = Int(buffer.frameLength)
      guard frames > 0 else { return }
      var sum: Float = 0
      for index in 0..<frames {
        let sample = channel[index]
        sum += sample * sample
      }
      let rms = sqrt(sum / Float(frames))
      let level = min(1, max(0, rms * 8))
      self.emitLevel(level)
      self.sampleLock.lock()
      if self.samples.count < cap {
        self.samples.append(contentsOf: UnsafeBufferPointer(start: channel, count: frames))
      }
      self.sampleLock.unlock()
    }
    tapInstalled = true

    audioEngine.prepare()
    try audioEngine.start()
  }

  private func stopSession() -> String? {
    stopping = true
    sampleLock.lock()
    let captured = samples
    let rate = sampleRate
    samples.removeAll(keepingCapacity: false)
    sampleLock.unlock()
    stopEngine()
    return writeWav(samples: captured, rate: Int(rate))
  }

  private func stopEngine() {
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    request?.endAudio()
    task?.cancel()
    task = nil
    request = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func emitLevel(_ value: Float) {
    let now = Date()
    if now.timeIntervalSince(lastLevelAt) < 0.07 { return }
    lastLevelAt = now
    DispatchQueue.main.async {
      self.sendEvent("level", ["value": value])
    }
  }

  private func writeWav(samples: [Float], rate: Int) -> String? {
    guard !samples.isEmpty, rate > 0 else { return nil }
    var pcm = Data()
    pcm.reserveCapacity(samples.count * 2)
    for sample in samples {
      let clamped = max(-1 as Float, min(1, sample))
      var value = Int16(clamped * 32767).littleEndian
      withUnsafeBytes(of: &value) { pcm.append(contentsOf: $0) }
    }
    let byteRate = UInt32(rate * 2)
    let chunkSize = UInt32(36 + pcm.count)
    var header = Data()
    func ascii(_ text: String) { header.append(Data(text.utf8)) }
    func u32(_ value: UInt32) {
      var little = value.littleEndian
      withUnsafeBytes(of: &little) { header.append(contentsOf: $0) }
    }
    func u16(_ value: UInt16) {
      var little = value.littleEndian
      withUnsafeBytes(of: &little) { header.append(contentsOf: $0) }
    }
    ascii("RIFF")
    u32(chunkSize)
    ascii("WAVE")
    ascii("fmt ")
    u32(16)
    u16(1)
    u16(1)
    u32(UInt32(rate))
    u32(byteRate)
    u16(2)
    u16(16)
    ascii("data")
    u32(UInt32(pcm.count))
    header.append(pcm)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("hatch-voice.wav")
    do {
      try header.write(to: url)
      return url.absoluteString
    } catch {
      return nil
    }
  }
}

private enum SpeechFailure: LocalizedError {
  case unavailable
  case onDeviceUnavailable
  case format

  var errorDescription: String? {
    switch self {
    case .unavailable:
      return "Speech recognition is not available on this iPhone."
    case .onDeviceUnavailable:
      return "On-device speech is not available for this language."
    case .format:
      return "The microphone is not available."
    }
  }
}
