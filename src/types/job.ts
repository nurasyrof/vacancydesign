export type PostType = 'twitter' | 'threads' | '';

export interface Job {
  id: string;
  companyName: string;
  roleTitle: string;
  city: string;
  country: string;
  employmentType: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  applyUrl: string;
  postedDate: string;
  expiryDate: string;
  active: boolean;
  isBoosted: boolean;
  logoUrl: string;
  postVerified: boolean;
  postType: PostType;
  postText: string;
  postHandle: string;
}
