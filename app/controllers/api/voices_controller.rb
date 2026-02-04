module Api
  class VoicesController < BaseController
    VOICES = %w[
      Zephyr Puck Charon Kore Fenrir Leda Orus Aoede
      Callirrhoe Autonoe Enceladus Iapetus Umbriel Algieba
      Despina Erinome Algenib Rasalgethi Laomedeia Achernar
      Alnilam Schedar Gacrux Pulcherrima Achird Zubenelgenubi
      Vindemiatrix Sadachbia Sadaltager Sulafat
    ].freeze

    def index
      render json: { ok: true, voices: VOICES }
    end
  end
end
