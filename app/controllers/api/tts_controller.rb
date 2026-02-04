module Api
  class TtsController < BaseController
    before_action :require_gemini_key!

    def create
      text = params[:text]
      voice = params[:voice] || "Orus"
      style = params[:style]

      unless text.present?
        return render json: { ok: false, error: "Missing text." }, status: :bad_request
      end

      unless Api::VoicesController::VOICES.include?(voice)
        return render json: { ok: false, error: "Unknown voice: #{voice}. Use GET /api/voices for list." }, status: :bad_request
      end

      Rails.logger.info("[tts] Generating audio - voice: #{voice}, text length: #{text.length}")

      tts = Gemini::TtsGenerator.new
      pcm_data = tts.generate(text: text, voice: voice, style: style)

      Rails.logger.info("[tts] Got #{pcm_data.bytesize} bytes of PCM audio")

      wav_data = Audio::WavBuilder.build(pcm_data)

      send_data wav_data,
        type: "audio/wav",
        disposition: "inline",
        filename: "newsreader.wav"

      Rails.logger.info("[tts] Sent #{wav_data.bytesize} byte WAV")
    end
  end
end
