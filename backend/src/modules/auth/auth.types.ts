export type AuthenticatedUser = {
    userId: string;
    email: string;
    name: string | null;
};

export type AuthJwtPayload = {
    sub: string;
    email: string;
    name: string | null;
};
