import { describe, expect, it } from 'vitest';
import type { Table, View } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

const strategy = new SnakeNamingStrategy();

function fakeTable(name: string): Table {
  return { name } as unknown as Table;
}

function fakeView(name: string): View {
  return { name } as unknown as View;
}

describe('SnakeNamingStrategy', () => {
  describe('tableName', () => {
    it('snake_cases the entity class name when no explicit name is given', () => {
      expect(strategy.tableName('AppMeta', undefined)).toBe('app_meta');
      expect(strategy.tableName('RefreshToken', undefined)).toBe('refresh_token');
    });

    it('snake_cases an explicit @Entity name too', () => {
      expect(strategy.tableName('User', 'AppUsers')).toBe('app_users');
    });
  });

  describe('columnName', () => {
    it('snake_cases a plain camelCase property name', () => {
      expect(strategy.columnName('createdAt', '', [])).toBe('created_at');
      expect(strategy.columnName('userId', '', [])).toBe('user_id');
    });

    it('prefers a custom column name when given', () => {
      expect(strategy.columnName('createdAt', 'insertedAt', [])).toBe('inserted_at');
    });

    it('applies embedded prefixes', () => {
      expect(strategy.columnName('city', '', ['homeAddress'])).toBe('home_address_city');
      expect(strategy.columnName('street', '', ['home', 'address'])).toBe('home_address_street');
    });
  });

  describe('relationName', () => {
    it('snake_cases the relation property name', () => {
      expect(strategy.relationName('authorActor')).toBe('author_actor');
    });
  });

  describe('joinColumnName', () => {
    it('joins the relation and referenced column names', () => {
      expect(strategy.joinColumnName('author', 'id')).toBe('author_id');
      expect(strategy.joinColumnName('avatarMedia', 'id')).toBe('avatar_media_id');
    });
  });

  describe('joinTableName / joinTableColumnName', () => {
    it('builds a deterministic join table name from both table names', () => {
      expect(strategy.joinTableName('posts', 'media', 'media', 'posts')).toBe('posts_media');
    });

    it('builds join column names from table + property/column', () => {
      expect(strategy.joinTableColumnName('posts', 'id')).toBe('posts_id');
      expect(strategy.joinTableColumnName('posts', 'id', 'postId')).toBe('posts_post_id');
      expect(strategy.joinTableInverseColumnName('media', 'id', 'mediaId')).toBe('media_media_id');
    });
  });

  describe('indexName', () => {
    it('is deterministic and human-readable', () => {
      expect(strategy.indexName(fakeTable('actors'), ['handle_normalized'])).toBe(
        'idx_actors_handle_normalized',
      );
    });

    it('produces the same name regardless of column order (sorted internally)', () => {
      const forward = strategy.indexName(fakeTable('posts'), ['author_actor_id', 'created_at']);
      const reversed = strategy.indexName(fakeTable('posts'), ['created_at', 'author_actor_id']);
      expect(forward).toBe(reversed);
    });

    it('accepts a View as well as a Table', () => {
      expect(strategy.indexName(fakeView('active_users'), ['email'])).toBe(
        'idx_active_users_email',
      );
    });

    it('strips a schema-qualified table name down to the bare table', () => {
      expect(strategy.indexName('public.posts', ['id'])).toBe('idx_posts_id');
    });

    it('truncates names past the 63-byte PostgreSQL identifier limit', () => {
      const longColumns = [
        'a_very_long_column_name_indeed',
        'another_extremely_long_column_name_here',
      ];
      const name = strategy.indexName(fakeTable('a_table_with_a_rather_long_name'), longColumns);
      expect(name.length).toBeLessThanOrEqual(63);
    });
  });

  describe('primaryKeyName / foreignKeyName / uniqueConstraintName', () => {
    it('are deterministic and prefixed distinctly', () => {
      expect(strategy.primaryKeyName(fakeTable('users'), ['id'])).toBe('pk_users_id');
      expect(strategy.foreignKeyName(fakeTable('posts'), ['author_actor_id'])).toBe(
        'fk_posts_author_actor_id',
      );
      expect(
        strategy.uniqueConstraintName(fakeTable('follows'), [
          'follower_actor_id',
          'followee_actor_id',
        ]),
      ).toBe('uq_follows_followee_actor_id_follower_actor_id');
    });
  });
});
