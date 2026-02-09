require "mini_magick"

class BulletinRenderer
  class FrameGenerator
    WIDTH = 1080
    HEIGHT = 1920
    FONT_BOLD = Rails.root.join("app", "assets", "fonts", "Inter-Bold.ttf").to_s
    FONT_REGULAR = Rails.root.join("app", "assets", "fonts", "Inter-Regular.ttf").to_s
    ACCENT_COLOR = "#E63946"

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
        # Placeholder circle — ImageMagick can't render color emoji
        placeholder = MiniMagick::Image.create(".png") do |f|
          MiniMagick::Tool::Convert.new do |cmd|
            cmd.size "200x200"
            cmd.merge! ["xc:none"]
            cmd.fill "rgba(255,255,255,0.15)"
            cmd.draw "circle 100,100 100,5"
            cmd << f.path
          end
        end
        canvas = canvas.composite(placeholder) do |c|
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
        font: FONT_BOLD,
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

      # Weather placeholder — ImageMagick can't render color emoji
      placeholder = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "300x300"
          cmd.merge! ["xc:none"]
          cmd.fill "rgba(255,255,255,0.15)"
          cmd.draw "circle 150,150 150,10"
          cmd << f.path
        end
      end
      canvas = canvas.composite(placeholder) do |c|
        c.compose "Over"
        c.gravity "North"
        c.geometry "+0+400"
      end

      # Temperature
      temp_img = render_text_image(temp_str, size: 120, width: 500, height: 200, font: FONT_BOLD, color: "white")
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

    # Generate a transparent overlay PNG for compositing on top of anchor video.
    # Professional news lower third with branding, poster, headline, and accent bar.
    def story_overlay(poster:, headline:, output:)
      # Transparent canvas
      canvas = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{HEIGHT}"
          cmd.merge! ["xc:none"]
          cmd << f.path
        end
      end

      # Top-left branding
      canvas = add_branding(canvas)

      # ── Lower third ──────────────────────────────
      lower_third_y = HEIGHT - 420  # starts 420px from bottom
      panel_height = 260

      # Bottom gradient (taller, behind everything)
      gradient = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x500"
          cmd.merge! ["gradient:rgba(0,0,0,0.85)-rgba(0,0,0,0)"]
          cmd.flip
          cmd << f.path
        end
      end
      canvas = canvas.composite(gradient) do |c|
        c.compose "Over"
        c.gravity "South"
      end

      # Semi-transparent panel
      panel = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{panel_height}"
          cmd.merge! ["xc:rgba(0,0,0,0.55)"]
          cmd << f.path
        end
      end
      canvas = canvas.composite(panel) do |c|
        c.compose "Over"
        c.geometry "+0+#{lower_third_y}"
      end

      # Red accent bar at top of panel
      accent = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x4"
          cmd.merge! ["xc:#{ACCENT_COLOR}"]
          cmd << f.path
        end
      end
      canvas = canvas.composite(accent) do |c|
        c.compose "Over"
        c.geometry "+0+#{lower_third_y}"
      end

      # "MOCK NEWS" label in accent color
      label_img = render_text_image(
        "MOCK NEWS",
        size: 24,
        width: 200,
        height: 36,
        font: FONT_BOLD,
        color: ACCENT_COLOR,
        gravity: "West"
      )
      canvas = canvas.composite(label_img) do |c|
        c.compose "Over"
        c.geometry "+48+#{lower_third_y + 24}"
      end

      # Headline text
      headline_img = render_text_image(
        (headline || "").upcase,
        size: 44,
        width: WIDTH - 96,
        height: 160,
        font: FONT_BOLD,
        color: "white",
        gravity: "NorthWest"
      )
      canvas = canvas.composite(headline_img) do |c|
        c.compose "Over"
        c.geometry "+48+#{lower_third_y + 70}"
      end

      # Poster thumbnail (right side, above lower third)
      if poster && File.exist?(poster)
        poster_img = MiniMagick::Image.open(poster)
        poster_img.resize "320x320^"
        poster_img.gravity "center"
        poster_img.extent "320x320"

        # Round corners
        mask = MiniMagick::Image.create(".png") do |f|
          MiniMagick::Tool::Convert.new do |cmd|
            cmd.size "320x320"
            cmd.merge! ["xc:none"]
            cmd.fill "white"
            cmd.draw "roundrectangle 0,0 319,319 16,16"
            cmd << f.path
          end
        end
        poster_img = poster_img.composite(mask) do |c|
          c.compose "DstIn"
        end

        canvas = canvas.composite(poster_img) do |c|
          c.compose "Over"
          c.gravity "East"
          c.geometry "+60+#{-HEIGHT / 6}"
        end
      end

      canvas.write(output)
      Rails.logger.info("[FrameGen] Story overlay: #{output}")
      output
    end

    private

    def add_branding(canvas)
      branding = render_text_image(
        "MOCK NEWS",
        size: 36,
        width: 400,
        height: 60,
        font: FONT_BOLD,
        color: "rgba(255,255,255,0.7)"
      )
      canvas.composite(branding) do |c|
        c.compose "Over"
        c.gravity "NorthWest"
        c.geometry "+40+80"
      end
    end

    def render_text_image(text, size:, width:, height:, font: FONT_REGULAR, color: "white", background: "none", gravity: "Center")
      img = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{width}x#{height}"
          cmd.merge! ["xc:#{background}"]
          cmd.gravity gravity
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
