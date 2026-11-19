# List Available Commands
default:
  just --list

# Start Development Server
develop:
    docker compose -f ./develop.yaml build
    docker compose -f ./develop.yaml up --watch
