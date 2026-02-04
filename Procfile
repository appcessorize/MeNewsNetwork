web: bundle exec thrust ./bin/rails server -b 0.0.0.0 -p ${PORT:-3000}
worker: bundle exec rails solid_queue:start
release: bundle exec rails db:prepare
