module Audio
  class WavBuilder
    def self.build(pcm_data, sample_rate: 24_000, channels: 1, bit_depth: 16)
      byte_rate = sample_rate * channels * (bit_depth / 8)
      block_align = channels * (bit_depth / 8)
      data_size = pcm_data.bytesize

      header = [
        "RIFF",                    # ChunkID
        36 + data_size,            # ChunkSize
        "WAVE",                    # Format
        "fmt ",                    # Subchunk1ID
        16,                        # Subchunk1Size (PCM)
        1,                         # AudioFormat (PCM=1)
        channels,                  # NumChannels
        sample_rate,               # SampleRate
        byte_rate,                 # ByteRate
        block_align,               # BlockAlign
        bit_depth,                 # BitsPerSample
        "data",                    # Subchunk2ID
        data_size                  # Subchunk2Size
      ].pack("a4Va4a4VvvVVvva4V")

      header + pcm_data
    end
  end
end
