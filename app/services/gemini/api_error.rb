module Gemini
  class ApiError < StandardError
    attr_reader :step, :http_status, :response_body, :file_state, :file_error

    def initialize(message, step:, http_status: nil, response_body: nil, file_state: nil, file_error: nil)
      @step = step
      @http_status = http_status
      @response_body = response_body&.to_s&.first(500)
      @file_state = file_state
      @file_error = file_error
      super(message)
    end

    def debug_hash
      {
        step: step,
        http_status: http_status,
        gemini_state: file_state,
        gemini_error: file_error,
        response_body: response_body
      }.compact
    end
  end
end
