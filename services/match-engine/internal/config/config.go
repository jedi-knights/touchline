// Package config loads match-engine configuration from environment variables
// using viper. All vars take a MATCH_ENGINE_ prefix; nested keys use _.
package config

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Log      LogConfig      `mapstructure:"log"`
	Database DatabaseConfig `mapstructure:"database"`
}

type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

type LogConfig struct {
	Level string `mapstructure:"level"` // debug | info | warn | error
}

type DatabaseConfig struct {
	URL string `mapstructure:"url"`
}

func Load() (*Config, error) {
	v := viper.New()
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.port", 8082)
	v.SetDefault("log.level", "info")
	v.SetDefault("database.url", "")

	v.SetEnvPrefix("MATCH_ENGINE")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	if cfg.Database.URL == "" {
		return nil, fmt.Errorf("MATCH_ENGINE_DATABASE_URL is required")
	}
	return &cfg, nil
}

// LogLevel maps the configured level string to a slog.Level. Unknown values
// fall back to Info so misconfiguration doesn't silence the service.
func (c *Config) LogLevel() slog.Level {
	switch strings.ToLower(c.Log.Level) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
