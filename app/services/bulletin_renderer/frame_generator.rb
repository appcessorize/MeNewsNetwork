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

    # Generate a transparent studio overlay PNG for compositing on anchor video.
    # Simplified: ME NEWS logo top-left (red) + "TODAY'S UPDATE" bar at bottom.
    def story_overlay(output:, poster: nil, headline: nil)
      # Transparent canvas
      canvas = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{HEIGHT}"
          cmd.merge! ["xc:none"]
          cmd << f.path
        end
      end

      # Top-left: ME NEWS in red
      logo = render_text_image(
        "ME NEWS",
        size: 36,
        width: 400,
        height: 60,
        font: FONT_BOLD,
        color: ACCENT_COLOR,
        gravity: "West"
      )
      canvas = canvas.composite(logo) do |c|
        c.compose "Over"
        c.gravity "NorthWest"
        c.geometry "+40+80"
      end

      # Bottom bar: white background, "TODAY'S UPDATE" in black
      bar_height = 80
      bar = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{bar_height}"
          cmd.merge! ["xc:rgba(255,255,255,0.92)"]
          cmd << f.path
        end
      end
      canvas = canvas.composite(bar) do |c|
        c.compose "Over"
        c.gravity "South"
      end

      bar_text = render_text_image(
        "TODAY'S UPDATE",
        size: 28,
        width: WIDTH - 96,
        height: bar_height - 20,
        font: FONT_BOLD,
        color: "black",
        gravity: "West"
      )
      canvas = canvas.composite(bar_text) do |c|
        c.compose "Over"
        c.gravity "SouthWest"
        c.geometry "+48+10"
      end

      canvas.write(output)
      Rails.logger.info("[FrameGen] Studio overlay: #{output}")
      output
    end

    # Generate a transparent overlay PNG for compositing on user videos.
    # White info bar at bottom with red "ME NEWS" + black headline.
    def user_video_overlay(headline:, output:)
      canvas = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{HEIGHT}"
          cmd.merge! ["xc:none"]
          cmd << f.path
        end
      end

      # Top-left: small ME NEWS branding in white (semi-transparent)
      small_logo = render_text_image(
        "ME NEWS",
        size: 24,
        width: 200,
        height: 40,
        font: FONT_BOLD,
        color: "rgba(255,255,255,0.6)",
        gravity: "West"
      )
      canvas = canvas.composite(small_logo) do |c|
        c.compose "Over"
        c.gravity "NorthWest"
        c.geometry "+32+60"
      end

      # Bottom info bar (~100px)
      bar_height = 100
      bar = MiniMagick::Image.create(".png") do |f|
        MiniMagick::Tool::Convert.new do |cmd|
          cmd.size "#{WIDTH}x#{bar_height}"
          cmd.merge! ["xc:rgba(255,255,255,0.92)"]
          cmd << f.path
        end
      end
      canvas = canvas.composite(bar) do |c|
        c.compose "Over"
        c.gravity "South"
      end

      # Red "ME NEWS" label on left of bar
      label = render_text_image(
        "ME NEWS",
        size: 20,
        width: 140,
        height: 30,
        font: FONT_BOLD,
        color: ACCENT_COLOR,
        gravity: "West"
      )
      canvas = canvas.composite(label) do |c|
        c.compose "Over"
        c.gravity "SouthWest"
        c.geometry "+32+52"
      end

      # Black headline text (right of logo area)
      headline_img = render_text_image(
        (headline || "").upcase,
        size: 28,
        width: WIDTH - 220,
        height: 70,
        font: FONT_BOLD,
        color: "black",
        gravity: "NorthWest"
      )
      canvas = canvas.composite(headline_img) do |c|
        c.compose "Over"
        c.gravity "SouthWest"
        c.geometry "+180+15"
      end

      canvas.write(output)
      Rails.logger.info("[FrameGen] User video overlay: #{output}")
      output
    end

    private

    def add_branding(canvas, color: "rgba(255,255,255,0.7)")
      branding = render_text_image(
        "ME NEWS",
        size: 36,
        width: 400,
        height: 60,
        font: FONT_BOLD,
        color: color
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
