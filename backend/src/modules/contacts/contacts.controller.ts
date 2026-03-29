import { Controller, Post, Body, Get, Delete, Param } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('contacts')
export class ContactsController {
    constructor(private readonly contactsService: ContactsService) { }

    @Post()
    create(@Body() createContactDto: CreateContactDto) {
        return this.contactsService.create(createContactDto);
    }

    @Get()
    findAll() {
        return this.contactsService.findAll();
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.contactsService.remove(id);
    }
}
