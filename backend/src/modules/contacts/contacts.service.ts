import { Injectable } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
    create(createContactDto: CreateContactDto) {
        return 'This action adds a new contact';
    }

    findAll() {
        return `This action returns all contacts`;
    }

    remove(id: string) {
        return `This action removes a #${id} contact`;
    }
}
