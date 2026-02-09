require "mini_magick"

class BulletinRenderer
  class FrameGenerator
    WIDTH = 1080
    HEIGHT = 1920

    # Generate a studio frame PNG for a story intro
    # Composites: background image + poster thumbnail + emoji PNG + headline + gradient
    def story_frame(background:, poster:, emoji:, headline:, output:, anchor_frame: nil)
      canvas = MiniMagick::Image.open(background)
      canvas.resize "#{WIDTH}x#{HEIGHT}^"
      canvas.gravity "center"
      canvas.extent "#{WIDTH}x#{HEIGHT}"

      # Dark overlay for readability
      overlay = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{HEIGHT}"
          cmd.merge! ["xc:rgba(0,0,0,0.45)"]
          cmd << f.path
        end
      end
      canvas = canvas.composite(overlay) { |c| c.compose "Over" }

      # Top branding bar
      canvas = add_branding(canvas)

      if anchor_frame
        # Future: overlay transparent anchor video frame
        anchor = MiniMagick::Image.open(anchor_frame)
        anchor.resize "400x600"
        canvas = canvas.composite(anchor) do |c|
          c.compose "Over"
          c.gravity "West"
          c.geometry "+60+0"
        end
      else
        # Emoji as text rendered on a separate image then composited
        emoji_img = render_text_image(emoji || "", size: 120, width: 200, height: 200)
        canvas = canvas.composite(emoji_img) do |c|
          c.compose "Over"
          c.gravity "West"
          c.geometry "+100+#{-HEIGHT / 8}"
        end
      end

      # Poster thumbnail (right side)
      if poster && File.exist?(poster)
        poster_img = MiniMagick::Image.open(poster)
        poster_img.resize "352x352^"
        poster_img.gravity "center"
        poster_img.extent "352x352"

        # Round corners via mask
        canvas = canvas.composite(poster_img) do |c|
          c.compose "Over"
          c.gravity "East"
          c.geometry "+100+#{-HEIGHT / 8}"
        end
      end

      # Headline text at bottom
      headline_img = render_text_image(
        (headline || "").upcase,
        size: 52,
        width: WIDTH - 80,
        height: 200,
        font: "DejaVu-Sans-Bold",
        color: "white",
        background: "rgba(0,0,0,0.6)"
      )
      canvas = canvas.composite(headline_img) do |c|
        c.compose "Over"
        c.gravity "South"
        c.geometry "+0+280"
      end

      # Bottom gradient
      gradient = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x400"
          cmd.merge! ["gradient:rgba(0,0,0,0.8)-rgba(0,0,0,0)"]
          cmd.flip
          cmd << f.path
        end
      end
      canvas = canvas.composite(gradient) do |c|
        c.compose "Over"
        c.gravity "South"
      end

      canvas.write(output)
      Rails.logger.info("[FrameGen] Story frame: #{output}")
      output
    end

    # Generate a weather frame PNG
    def weather_frame(background:, weather_data:, output:)
      canvas = MiniMagick::Image.open(background)
      canvas.resize "#{WIDTH}x#{HEIGHT}^"
      canvas.gravity "center"
      canvas.extent "#{WIDTH}x#{HEIGHT}"

      # Dark overlay
      overlay = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{HEIGHT}"
          cmd.merge! ["xc:rgba(0,0,0,0.5)"]
          cmd << f.path
        end
      end
      canvas = canvas.composite(overlay) { |c| c.compose "Over" }

      canvas = add_branding(canvas)

      report = weather_data&.dig("report") || weather_data&.dig(:report) || {}
      narration = weather_data&.dig("narration") || weather_data&.dig(:narration) || {}
      current = report["current"] || report[:current] || {}

      emoji = narration["weatherEmoji"] || narration[:weatherEmoji] || "🌤️"
      temp = current["temp_c"] || current[:temp_c]
      temp_str = temp ? "#{temp.round}°C" : ""
      headline = narration["weatherHeadline"] || narration[:weatherHeadline] || "Weather"
      summary = current["summary"] || current[:summary] || ""

      # Weather emoji
      emoji_img = render_text_image(emoji, size: 160, width: 300, height: 300)
      canvas = canvas.composite(emoji_img) do |c|
        c.compose "Over"
        c.gravity "North"
        c.geometry "+0+400"
      end

      # Temperature
      temp_img = render_text_image(temp_str, size: 120, width: 500, height: 200, font: "DejaVu-Sans-Bold", color: "white")
      canvas = canvas.composite(temp_img) do |c|
        c.compose "Over"
        c.gravity "North"
        c.geometry "+0+700"
      end

      # Summary
      summary_img = render_text_image(summary, size: 40, width: WIDTH - 120, height: 100, color: "rgba(255,255,255,0.8)")
      canvas = canvas.composite(summary_img) do |c|
        c.compose "Over"
        c.gravity "North"
        c.geometry "+0+880"
      end

      # Headline
      headline_img = render_text_image(headline, size: 36, width: WIDTH - 120, height: 80, color: "rgba(255,255,255,0.5)")
      canvas = canvas.composite(headline_img) do |c|
        c.compose "Over"
        c.gravity "North"
        c.geometry "+0+980"
      end

      # Bottom gradient
      gradient = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x400"
          cmd.merge! ["gradient:rgba(0,0,0,0.8)-rgba(0,0,0,0)"]
          cmd.flip
          cmd << f.path
        end
      end
      canvas = canvas.composite(gradient) do |c|
        c.compose "Over"
        c.gravity "South"
      end

      canvas.write(output)
      Rails.logger.info("[FrameGen] Weather frame: #{output}")
      output
    end

    private

    def add_branding(canvas)
      branding = render_text_image(
        "MOCK NEWS",
        size: 36,
        width: 400,
        height: 60,
        font: "DejaVu-Sans-Bold",
        color: "rgba(255,255,255,0.7)"
      )
      canvas.composite(branding) do |c|
        c.compose "Over"
        c.gravity "NorthWest"
        c.geometry "+40+80"
      end
    end

    def render_text_image(text, size:, width:, height:, font: "DejaVu-Sans", color: "white", background: "none")
      img = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{width}x#{height}"
          cmd.merge! ["xc:#{background}"]
          cmd.gravity "Center"
          cmd.fill color
          cmd.font font
          cmd.pointsize size
          cmd.annotate "+0+0", text.to_s
          cmd << f.path
        end
      end
      img
    end
  end
end
