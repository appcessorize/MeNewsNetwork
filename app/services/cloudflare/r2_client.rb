require "aws-sdk-s3"

module Cloudflare
  class R2Client
    def initialize(
      bucket: Rails.configuration.x.cloudflare.r2_bucket,
      access_key_id: Rails.configuration.x.cloudflare.r2_access_key_id,
      secret_access_key: Rails.configuration.x.cloudflare.r2_secret_access_key,
      endpoint: Rails.configuration.x.cloudflare.r2_endpoint
    )
      @bucket = bucket
      @access_key_id = access_key_id
      @secret_access_key = secret_access_key
      @endpoint = endpoint
      @client = nil
    end

    def configured?
      @bucket.present? && @access_key_id.present? && @secret_access_key.present? && @endpoint.present?
    end

    # Upload a file path or IO object to R2
    def upload(key, file_or_io, content_type: "application/octet-stream")
      body = file_or_io.is_a?(String) ? File.open(file_or_io, "rb") : file_or_io

      client.put_object(
        bucket: @bucket,
        key: key,
        body: body,
        content_type: content_type
      )

      Rails.logger.info("[R2] Uploaded: #{key}")
      key
    ensure
      body.close if body.is_a?(File)
    end

    # Download an object to a local file path
    def download(key, dest_path)
      client.get_object(
        bucket: @bucket,
        key: key,
        response_target: dest_path
      )

      Rails.logger.info("[R2] Downloaded: #{key} → #{dest_path}")
      dest_path
    end

    # Generate a presigned GET URL
    def presigned_url(key, expires_in: 3600)
      signer = Aws::S3::Presigner.new(client: client)
      signer.presigned_url(:get_object, bucket: @bucket, key: key, expires_in: expires_in)
    end

    # Delete an object
    def delete(key)
      client.delete_object(bucket: @bucket, key: key)
      Rails.logger.info("[R2] Deleted: #{key}")
    rescue => e
      Rails.logger.warn("[R2] Delete failed for #{key}: #{e.message}")
    end

    private

    def client
      @client ||= Aws::S3::Client.new(
        access_key_id: @access_key_id,
        secret_access_key: @secret_access_key,
        endpoint: @endpoint,
        region: "auto",
        force_path_style: true
      )
    end
  end
end
