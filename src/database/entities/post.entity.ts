import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { PlatformPost } from './platform-post.entity';

export enum PostEntityStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'scheduled_for', type: 'timestamp', nullable: true })
  scheduledFor: Date | null;

  @Column({
    type: 'enum',
    enum: PostEntityStatus,
    default: PostEntityStatus.PENDING,
  })
  status: PostEntityStatus;

  @OneToMany(() => PlatformPost, (platformPost) => platformPost.post, {
    cascade: true,
  })
  platformPosts: PlatformPost[];
}
