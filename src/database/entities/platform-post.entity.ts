import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Post } from './post.entity';

export enum PlatformPostStatus {
  QUEUED = 'queued',
  POSTED = 'posted',
  FAILED = 'failed',
}

@Entity('platform_posts')
export class PlatformPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id' })
  postId: string;

  @ManyToOne(() => Post, (post) => post.platformPosts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ type: 'varchar', length: 50 })
  platform: string;

  @Column({ name: 'platform_post_id', type: 'varchar', nullable: true })
  platformPostId: string | null;

  @Column({
    type: 'enum',
    enum: PlatformPostStatus,
    default: PlatformPostStatus.QUEUED,
  })
  status: PlatformPostStatus;

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'varchar', nullable: true })
  url: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
